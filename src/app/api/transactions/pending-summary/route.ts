import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// GET /api/transactions/pending-summary?orderbookerId=xxx
// Returns count + total of pending credit transactions (instead of fetching 500 records)
export async function GET(request: NextRequest) {
  let client;
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');

    client = getPgClient();
    await client.connect();

    const conditions: string[] = [`t.type = 'credit'`, `t.status = 'pending'`];
    const params: any[] = [];
    let paramIndex = 1;

    if (orderbookerId) {
      // Filter by orderbooker's shops
      conditions.push(`s."orderbookerId" = $${paramIndex++}`);
      params.push(orderbookerId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const summaryRes = await client.query(
      `SELECT COUNT(t.id) AS count, COALESCE(SUM(t.amount), 0) AS total
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       ${whereClause}`,
      params
    );

    const count = parseInt(summaryRes.rows[0].count, 10);
    const total = Number(summaryRes.rows[0].total);

    // Get a few recent pending transactions for preview
    const previewRes = await client.query(
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

    await client.end();
    return NextResponse.json({
      count,
      total: Math.round(total * 100) / 100,
      preview,
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error fetching pending summary:', error);
    return NextResponse.json({ error: 'Failed to fetch pending summary' }, { status: 500 });
  }
}
