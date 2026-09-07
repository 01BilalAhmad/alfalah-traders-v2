import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/ob-performance?period=week|month|quarter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';

    // ─── All day/period boundaries in PAKISTAN time (PKT = UTC+5, no DST) ───
    // Previously used server-local setHours(0,0,0,0) — on a UTC server
    // (Vercel) "today" ran 19:00 UTC→19:00 UTC, so PKT 00:00–04:59
    // recoveries landed on the wrong day and month/week/quarter windows
    // shifted by 5 hours vs the dashboard's PKT-based numbers.
    const pktNow = new Date(Date.now() + 5 * 60 * 60 * 1000);
    const pktTodayStr = `${pktNow.getUTCFullYear()}-${String(pktNow.getUTCMonth() + 1).padStart(2, '0')}-${String(pktNow.getUTCDate()).padStart(2, '0')}`;
    const [tY, tM, tD] = pktTodayStr.split('-').map(Number);

    // Today's date range (PKT)
    const todayStart = new Date(Date.UTC(tY, tM - 1, tD, -5, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(tY, tM - 1, tD, 18, 59, 59, 999));

    // Period start (PKT calendar), converted to a UTC instant
    let periodStart: Date;
    if (period === 'week') {
      // Start of this week (Monday) in PKT calendar
      const pktDow = pktNow.getUTCDay(); // 0=Sun … 6=Sat
      const daysBack = pktDow === 0 ? 6 : pktDow - 1;
      const monday = new Date(pktNow);
      monday.setUTCDate(monday.getUTCDate() - daysBack);
      const [wY, wM, wD] = [
        monday.getUTCFullYear(),
        monday.getUTCMonth() + 1,
        monday.getUTCDate(),
      ];
      periodStart = new Date(Date.UTC(wY, wM - 1, wD, -5, 0, 0, 0));
    } else if (period === 'month') {
      // Start of this month (PKT)
      periodStart = new Date(Date.UTC(tY, tM - 1, 1, -5, 0, 0, 0));
    } else {
      // Start of this quarter (PKT)
      const quarter = Math.floor((tM - 1) / 3);
      periodStart = new Date(Date.UTC(tY, quarter * 3, 1, -5, 0, 0, 0));
    }

    const startDate = periodStart;
    const endDate = todayEnd;

    const pool = getPool();

    // Get all orderbookers (including inactive for comparison)
    const obRes = await pool.query(
      `SELECT id, name, phone, status FROM "User" WHERE role = 'orderbooker' ORDER BY name ASC`
    );
    const orderbookers: any[] = obRes.rows;

    // For each orderbooker, compute aggregated stats
    const performanceData = await Promise.all(
      orderbookers.map(async (ob: any) => {
        // Get ACTIVE shops assigned to this orderbooker.
        // (inactive shops previously inflated totalShops/totalOutstanding —
        // the OB list itself intentionally includes inactive OBs for
        // comparison, but their inactive shops shouldn't count as workload)
        const shopRes = await pool.query(
          `SELECT id, balance, status FROM "Shop" WHERE "orderbookerId" = $1 AND status = 'active'`,
          [ob.id]
        );
        const shops: any[] = shopRes.rows;

        const totalShops = shops.length;
        const totalOutstanding = shops.reduce((sum: number, shop: any) => sum + Number(shop.balance), 0);

        // Today's recovery (including admin-posted recoveries for this OB's shops).
        // recovery = recovery + supplier_collection — consistent with the
        // dashboard and other reports so numbers match across screens.
        const todayRecoveryRes = await pool.query(
          `SELECT t.amount FROM "Transaction" t
           LEFT JOIN "Shop" s ON t."shopId" = s.id
           WHERE t.type IN ('recovery', 'supplier_collection') AND t.status = 'approved' AND s."orderbookerId" = $1 AND t."createdAt" >= $2 AND t."createdAt" <= $3`,
          [ob.id, todayStart.toISOString(), todayEnd.toISOString()]
        );
        const todayRecovery = todayRecoveryRes.rows.reduce((sum: number, t: any) => sum + Number(t.amount), 0);

        // Period recovery (including admin-posted recoveries for this OB's shops)
        const periodRecoveryRes = await pool.query(
          `SELECT t.amount FROM "Transaction" t
           LEFT JOIN "Shop" s ON t."shopId" = s.id
           WHERE t.type IN ('recovery', 'supplier_collection') AND t.status = 'approved' AND s."orderbookerId" = $1 AND t."createdAt" >= $2 AND t."createdAt" <= $3`,
          [ob.id, startDate.toISOString(), endDate.toISOString()]
        );
        const periodRecovery = periodRecoveryRes.rows.reduce((sum: number, t: any) => sum + Number(t.amount), 0);

        // Last active date (last transaction by this orderbooker)
        const lastTxnRes = await pool.query(
          `SELECT "createdAt" FROM "Transaction" WHERE "createdBy" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
          [ob.id]
        );
        const lastTxn = lastTxnRes.rows[0] || null;

        // Compute working days in period
        let workingDays: number;
        if (period === 'week') {
          workingDays = 6; // Mon-Sat
        } else if (period === 'month') {
          workingDays = 26; // ~26 working days
        } else {
          workingDays = 78; // ~78 working days in a quarter
        }

        // Average recovery per shop — METRIC FIX: previously divided by
        // workingDays (a per-day average mislabeled as per-shop). The UI
        // column is labeled 'Avg/Shop', so divide by the shop count.
        const avgRecoveryPerShop = totalShops > 0 ? periodRecovery / totalShops : 0;

        // Recovery rate: ratio of period recovery to outstanding
        // If outstanding is 0, recovery rate is 100%
        const recoveryRate = totalOutstanding > 0
          ? Math.min(100, (periodRecovery / totalOutstanding) * 100)
          : 100;

        return {
          orderbookerId: ob.id,
          orderbookerName: ob.name,
          orderbookerPhone: ob.phone,
          orderbookerStatus: ob.status,
          totalShops,
          totalOutstanding: Math.round(totalOutstanding * 100) / 100,
          todayRecovery: Math.round(todayRecovery * 100) / 100,
          periodRecovery: Math.round(periodRecovery * 100) / 100,
          lastActive: lastTxn ? (lastTxn.createdAt instanceof Date ? lastTxn.createdAt.toISOString() : lastTxn.createdAt) : null,
          avgRecoveryPerShop: Math.round(avgRecoveryPerShop * 100) / 100,
          recoveryRate: Math.round(recoveryRate * 10) / 10,
        };
      })
    );

    // Sort by periodRecovery descending
    performanceData.sort((a, b) => b.periodRecovery - a.periodRecovery);

    return NextResponse.json(performanceData);
  } catch (error) {
    console.error('Error generating OB performance analytics:', error);
    return NextResponse.json({ error: 'Failed to generate OB performance analytics' }, { status: 500 });
  }
}
