import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/transactions/pending-summary?orderbookerId=xxx&type=credit|recovery|all
// Returns count + total of pending transactions (instead of fetching 500 records)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    // Support type filter: 'credit' (default for mobile banner), 'recovery', or 'all'
    const typeFilter = searchParams.get('type') || 'credit';

    const pool = getPool();

    const conditions: string[] = [`t.status = 'pending'`];
    const params: any[] = [];

    if (typeFilter !== 'all') {
      conditions.push(`t.type = $${params.length + 1}`);
      params.push(typeFilter);
    }

    if (orderbookerId) {
      // Filter by orderbooker's shops
      conditions.push(`s."orderbookerId" = $${params.length + 1}`);
      params.push(orderbookerId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const summaryRes = await pool.query(
      `SELECT COUNT(t.id) AS count, COALESCE(SUM(t.amount), 0) AS total
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       ${whereClause}`,
      params
    );

    const count = parseInt(summaryRes.rows[0].count, 10);
    const total = Number(summaryRes.rows[0].total);

    // Get a few recent pending transactions for preview
    const previewRes = await pool.query(
      `SELECT t.id, t.amount, t."createdAt", s.name AS "shopName", s.area AS "shopArea"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       ${whereClause}
       ORDER BY t."createdAt" DESC
       LIMIT 10`,
      params
    );

    const preview = previewRes.rows.map((t: any) => ({
      id: t.id,
      amount: Number(t.amount),
      shopName: t.shopName,
      shopArea: t.shopArea,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    }));

    return NextResponse.json({
      count,
      total: Math.round(total * 100) / 100,
      preview,
    });
  } catch (error) {
    console.error('Error fetching pending summary:', error);
    return NextResponse.json({ error: 'Failed to fetch pending summary' }, { status: 500 });
  }
}
