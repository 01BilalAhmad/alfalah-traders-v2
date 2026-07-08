import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/shop-ratio
// Per-shop credit recovery ratio — total credit given vs total recovery collected.
// Identifies shops where credit is high but recovery is low (risk shops).
//
// Query params:
//   - orderbookerId: filter by OB (optional)
//   - minBalance: minimum outstanding balance to include (default: 0)
//   - limit: max results (default: 100, max: 500)
//
// Response:
//   {
//     shops: [{ shopId, shopName, area, orderbookerName, totalCredit, totalRecovery, balance, ratio, status }],
//     summary: { totalShops, totalCredit, totalRecovery, avgRatio, riskShops }
//   }
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const minBalance = parseFloat(searchParams.get('minBalance') || '0');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

    const pool = getPool();

    const conditions: string[] = [`s.status = 'active'`];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (orderbookerId) {
      conditions.push(`s."orderbookerId" = $${paramIdx++}`);
      params.push(orderbookerId);
    }

    if (minBalance > 0) {
      conditions.push(`s.balance >= $${paramIdx++}`);
      params.push(minBalance);
    }

    const whereClause = conditions.join(' AND ');

    const res = await pool.query(
      `SELECT
         s.id AS "shopId",
         s.name AS "shopName",
         s.area,
         s.balance,
         s."orderbookerId",
         u.name AS "orderbookerName",
         COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.status = 'approved' THEN t.amount ELSE 0 END), 0) AS "totalCredit",
         COALESCE(SUM(CASE WHEN t.type = 'recovery' AND t.status = 'approved' THEN t.amount ELSE 0 END), 0) AS "totalRecovery"
       FROM "Shop" s
       LEFT JOIN "Transaction" t ON s.id = t."shopId"
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       WHERE ${whereClause}
       GROUP BY s.id, s.name, s.area, s.balance, s."orderbookerId", u.name
       ORDER BY s.balance DESC
       LIMIT $${paramIdx++}`,
      [...params, limit]
    );

    const shops: any[] = [];
    let totalCredit = 0;
    let totalRecovery = 0;
    let riskShops = 0;

    for (const row of res.rows) {
      const credit = Number(row.totalCredit);
      const recovery = Number(row.totalRecovery);
      const balance = Number(row.balance);
      const ratio = credit > 0 ? Math.round((recovery / credit) * 100) : 0;

      let status: string;
      if (credit === 0) {
        status = 'no-credit';
      } else if (ratio >= 70) {
        status = 'good';
      } else if (ratio >= 40) {
        status = 'watch';
      } else {
        status = 'critical';
        riskShops++;
      }

      totalCredit += credit;
      totalRecovery += recovery;

      shops.push({
        shopId: row.shopId,
        shopName: row.shopName,
        area: row.area || 'Unknown',
        orderbookerName: row.orderbookerName || 'Unassigned',
        totalCredit: Math.round(credit * 100) / 100,
        totalRecovery: Math.round(recovery * 100) / 100,
        balance: Math.round(balance * 100) / 100,
        ratio,
        status,
      });
    }

    const avgRatio = totalCredit > 0 ? Math.round((totalRecovery / totalCredit) * 100) : 0;

    return NextResponse.json({
      shops,
      summary: {
        totalShops: shops.length,
        totalCredit: Math.round(totalCredit * 100) / 100,
        totalRecovery: Math.round(totalRecovery * 100) / 100,
        avgRatio,
        riskShops,
      },
    });
  } catch (error) {
    console.error('[Shop Ratio] Error:', error);
    return NextResponse.json({ error: 'Failed to generate shop ratio report' }, { status: 500 });
  }
}
