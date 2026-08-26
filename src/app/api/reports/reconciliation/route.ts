import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// ─── Pakistan Standard Time (PKT) helpers ──────────────────────────
// BUG FIX (previously): getDayRange() used Date.UTC(year, month-1, day, ...)
// which made the report filter by UTC midnight → UTC midnight.
// Pakistan is UTC+5 and has NOT observed DST since 2009, so PKT 00:00
// is consistently UTC 19:00 (previous day). The old code therefore:
//   - MISSED transactions made between PKT 00:00–04:59 (still in UTC yesterday)
//   - INCLUDED transactions made between PKT 00:00–04:59 of the NEXT day
//   Net effect: every reconciliation report was off by ~5 hours.
//
// Fix: compute the day's boundaries in PKT, then convert to UTC ms
// timestamps before sending to Postgres. Postgres stores timestamps in
// UTC, so a BETWEEN '2024-08-01T19:00:00.000Z' AND '2024-08-02T18:59:59.999Z'
// is exactly "PKT 1st August 00:00 → 23:59:59.999".

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // PKT = UTC+5 (no DST since 2009)

function getPktDayRangeUtc(dateStr: string): { start: Date; end: Date; displayDate: string } {
  const [year, month, day] = dateStr.split('-').map(Number);
  // PKT 00:00:00.000 = UTC midnight minus 5 hours
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - PKT_OFFSET_MS);
  // PKT 23:59:59.999 = UTC 23:59:59 minus 5 hours
  const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - PKT_OFFSET_MS);
  return { start, end, displayDate: dateStr };
}

function getTodayPktString(): string {
  // Intl with en-CA gives ISO-like "YYYY-MM-DD" format, which is what
  // our dateStr parser expects. timeZone: 'Asia/Karachi' makes the
  // calendar day be the PKT day, not the UTC day.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// GET /api/reports/reconciliation?date=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');

    let startDate: Date;
    let endDate: Date;
    let displayDate: string;

    if (dateStr) {
      // Validate format: must be YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD.' },
          { status: 400 }
        );
      }
      const range = getPktDayRangeUtc(dateStr);
      startDate = range.start;
      endDate = range.end;
      displayDate = range.displayDate;
    } else {
      // Default to "today" in PKT, not UTC. Previously this used today.getUTCDate()
      // which was wrong by 5 hours for PKT-based reports.
      const todayPkt = getTodayPktString();
      const range = getPktDayRangeUtc(todayPkt);
      startDate = range.start;
      endDate = range.end;
      displayDate = range.displayDate;
    }

    const pool = getPool();

    // Get all transactions for the day with shop and creator info
    const dayTxnRes = await pool.query(
      `SELECT t.id, t.type, t.amount, t."shopId", t."createdAt", t.description,
              s.id AS "shop_id", s.name AS "shop_name", s.area AS "shop_area", s."orderbookerId" AS "shop_orderbookerId",
              c.id AS "creator_id", c.name AS "creator_name", c.role AS "creator_role"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       LEFT JOIN "User" c ON t."createdBy" = c.id
       WHERE t."createdAt" >= $1 AND t."createdAt" <= $2 AND t.status = 'approved'
       ORDER BY t."createdAt" DESC`,
      [startDate.toISOString(), endDate.toISOString()]
    );

    const dayTransactions: any[] = dayTxnRes.rows;

    // Calculate totals
    const totalCredit = dayTransactions
      .filter((t: any) => t.type === 'credit')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const totalRecovery = dayTransactions
      .filter((t: any) => t.type === 'recovery')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    // Group by orderbooker
    const orderbookerIds = [...new Set(dayTransactions.map((t: any) => t.shop_orderbookerId).filter(Boolean))];
    const orderbookerStats = await Promise.all(
      orderbookerIds.map(async (obId: string) => {
        const obRes = await pool.query(
          'SELECT id, name FROM "User" WHERE id = $1',
          [obId]
        );
        const ob = obRes.rows[0];
        const obTransactions = dayTransactions.filter((t: any) => t.shop_orderbookerId === obId);
        const obCredit = obTransactions.filter((t: any) => t.type === 'credit').reduce((s: number, t: any) => s + Number(t.amount), 0);
        const obRecovery = obTransactions.filter((t: any) => t.type === 'recovery').reduce((s: number, t: any) => s + Number(t.amount), 0);

        // Get shop-level details
        const shopDetails = await Promise.all(
          [...new Set(obTransactions.map((t: any) => t.shopId))].map(async (shopId: string) => {
            const shopRes = await pool.query(
              'SELECT id, name, area, balance FROM "Shop" WHERE id = $1',
              [shopId]
            );
            const shop = shopRes.rows[0];
            const shopTxns = obTransactions.filter((t: any) => t.shopId === shopId);
            const credit = shopTxns.filter((t: any) => t.type === 'credit').reduce((s: number, t: any) => s + Number(t.amount), 0);
            const recovery = shopTxns.filter((t: any) => t.type === 'recovery').reduce((s: number, t: any) => s + Number(t.amount), 0);
            const prevBalance = shopTxns[0]?.previousBalance || shop?.balance || 0;
            return {
              shopId,
              shopName: shop?.name || 'Unknown',
              shopArea: shop?.area || '',
              previousBalance: Math.round(Number(prevBalance) * 100) / 100,
              credit: Math.round(credit * 100) / 100,
              recovery: Math.round(recovery * 100) / 100,
              closingBalance: Math.round((Number(prevBalance) + credit - recovery) * 100) / 100,
            };
          })
        );

        return {
          orderbookerId: obId,
          orderbookerName: ob?.name || 'Unknown',
          credit: Math.round(obCredit * 100) / 100,
          recovery: Math.round(obRecovery * 100) / 100,
          shops: shopDetails,
        };
      })
    );

    return NextResponse.json({
      date: displayDate,
      totalCredit: Math.round(totalCredit * 100) / 100,
      totalRecovery: Math.round(totalRecovery * 100) / 100,
      netChange: Math.round((totalRecovery - totalCredit) * 100) / 100,
      totalTransactions: dayTransactions.length,
      orderbookers: orderbookerStats,
    });
  } catch (error) {
    console.error('Error generating reconciliation report:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
