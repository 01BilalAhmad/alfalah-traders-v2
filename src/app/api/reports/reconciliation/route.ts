import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// Helper: Convert a date string (YYYY-MM-DD) to UTC day boundaries
function getDayRange(dateStr: string): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  return { start, end };
}

// GET /api/reports/reconciliation?date=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');

    // Use Pakistan timezone
    let startDate: Date;
    let endDate: Date;
    let displayDate: string;

    if (dateStr) {
      const range = getDayRange(dateStr);
      startDate = range.start;
      endDate = range.end;
      displayDate = dateStr;
    } else {
      const today = new Date();
      const y = today.getUTCFullYear();
      const m = today.getUTCMonth();
      const d = today.getUTCDate();
      startDate = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
      displayDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
