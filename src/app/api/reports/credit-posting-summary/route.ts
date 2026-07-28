import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/credit-posting-summary
// Query: date (YYYY-MM-DD, required), companyId (optional), orderbookerId (optional)
// Returns all credit transactions for the given date with shop + OB details

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const companyId = searchParams.get('companyId');
    const orderbookerId = searchParams.get('orderbookerId');

    if (!dateStr) {
      return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 });
    }

    // Parse date in PKT (UTC+5)
    const [y, m, d] = dateStr.split('-').map(Number);
    const startUTC = new Date(Date.UTC(y, m - 1, d, -5, 0, 0, 0));
    const endUTC = new Date(Date.UTC(y, m - 1, d, 18, 59, 59, 999));

    const pool = getPool();

    const params: (string | Date)[] = [startUTC, endUTC];
    let paramIdx = 3;
    let companyFilter = '';
    let obFilter = '';

    if (companyId) {
      companyFilter = ` AND t."companyId" = $${paramIdx++}`;
      params.push(companyId);
    }
    if (orderbookerId && orderbookerId !== 'all') {
      obFilter = ` AND s."orderbookerId" = $${paramIdx++}`;
      params.push(orderbookerId);
    }

    const res = await pool.query(
      `SELECT
         t.id,
         t.amount,
         t."previousBalance",
         t."newBalance",
         t.description,
         t."createdAt",
         t."companyId",
         co.name AS "companyName",
         t."shopId",
         s.name AS "shopName",
         s.area AS "shopArea",
         s.address AS "shopAddress",
         s."orderbookerId",
         u.name AS "orderbookerName",
         t."createdBy" AS "creatorId",
         cu.name AS "creatorName"
       FROM "Transaction" t
       JOIN "Shop" s ON t."shopId" = s.id
       LEFT JOIN "Company" co ON t."companyId" = co.id
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       LEFT JOIN "User" cu ON t."createdBy" = cu.id
       WHERE t.type = 'credit'
         AND t.status = 'approved'
         AND t."createdAt" >= $1
         AND t."createdAt" <= $2
         ${companyFilter}
         ${obFilter}
       ORDER BY t."createdAt" ASC`,
      params
    );

    const credits = res.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      amount: Number(row.amount),
      previousBalance: Number(row.previousBalance),
      newBalance: Number(row.newBalance),
      description: (row.description as string) || null,
      createdAt: row.createdAt instanceof Date ? (row.createdAt as Date).toISOString() : String(row.createdAt),
      companyName: (row.companyName as string) || null,
      shopId: row.shopId as string,
      shopName: (row.shopName as string) || 'Unknown',
      shopArea: (row.shopArea as string) || null,
      shopAddress: (row.shopAddress as string) || null,
      orderbookerId: (row.orderbookerId as string) || null,
      orderbookerName: (row.orderbookerName as string) || 'Unassigned',
      creatorName: (row.creatorName as string) || 'Unknown',
    }));

    // Summary
    const totalAmount = Math.round(credits.reduce((s: number, c: any) => s + c.amount, 0) * 100) / 100;
    const totalShops = new Set(credits.map((c: any) => c.shopId)).size;
    const totalTransactions = credits.length;

    // Per-company breakdown
    const companyBreakdown: Record<string, { companyName: string; totalAmount: number; shopCount: number }> = {};
    for (const c of credits) {
      const cn = c.companyName || 'Unknown';
      if (!companyBreakdown[cn]) {
        companyBreakdown[cn] = { companyName: cn, totalAmount: 0, shopCount: new Set<string>().size };
        companyBreakdown[cn].shopCount = 0;
      }
      companyBreakdown[cn].totalAmount += c.amount;
      companyBreakdown[cn].shopCount++;
    }
    const companySummary = Object.values(companyBreakdown).map((c: any) => ({
      ...c,
      totalAmount: Math.round(c.totalAmount * 100) / 100,
    }));

    return NextResponse.json({
      date: dateStr,
      credits,
      summary: {
        totalAmount,
        totalShops,
        totalTransactions,
      },
      companySummary,
    });
  } catch (error) {
    console.error('[Credit Posting Summary API] Error:', error);
    return NextResponse.json({ error: `Failed: ${(error as Error)?.message || 'Unknown'}` }, { status: 500 });
  }
}
