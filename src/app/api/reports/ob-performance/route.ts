import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/ob-performance?period=week|month|quarter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';

    // Calculate date range based on period
    const now = new Date();
    const startDate = new Date();

    if (period === 'week') {
      // Start of this week (Monday)
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
      startDate.setDate(now.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      // Start of this month
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'quarter') {
      // Start of this quarter
      const quarter = Math.floor(now.getMonth() / 3);
      startDate.setMonth(quarter * 3, 1);
      startDate.setHours(0, 0, 0, 0);
    }

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // Today's date range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const pool = getPool();

    // Get all orderbookers (including inactive for comparison)
    const obRes = await pool.query(
      `SELECT id, name, phone, status FROM "User" WHERE role = 'orderbooker' ORDER BY name ASC`
    );
    const orderbookers: any[] = obRes.rows;

    // For each orderbooker, compute aggregated stats
    const performanceData = await Promise.all(
      orderbookers.map(async (ob: any) => {
        // Get shops assigned to this orderbooker
        const shopRes = await pool.query(
          `SELECT id, balance, status FROM "Shop" WHERE "orderbookerId" = $1`,
          [ob.id]
        );
        const shops: any[] = shopRes.rows;

        const totalShops = shops.length;
        const totalOutstanding = shops.reduce((sum: number, shop: any) => sum + Number(shop.balance), 0);

        // Today's recovery (including admin-posted recoveries for this OB's shops)
        const todayRecoveryRes = await pool.query(
          `SELECT t.amount FROM "Transaction" t
           LEFT JOIN "Shop" s ON t."shopId" = s.id
           WHERE t.type = 'recovery' AND t.status = 'approved' AND s."orderbookerId" = $1 AND t."createdAt" >= $2 AND t."createdAt" <= $3`,
          [ob.id, todayStart.toISOString(), todayEnd.toISOString()]
        );
        const todayRecovery = todayRecoveryRes.rows.reduce((sum: number, t: any) => sum + Number(t.amount), 0);

        // Period recovery (including admin-posted recoveries for this OB's shops)
        const periodRecoveryRes = await pool.query(
          `SELECT t.amount FROM "Transaction" t
           LEFT JOIN "Shop" s ON t."shopId" = s.id
           WHERE t.type = 'recovery' AND t.status = 'approved' AND s."orderbookerId" = $1 AND t."createdAt" >= $2 AND t."createdAt" <= $3`,
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

        // Average recovery per shop
        const avgRecoveryPerShop = totalShops > 0 ? periodRecovery / workingDays : 0;

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
