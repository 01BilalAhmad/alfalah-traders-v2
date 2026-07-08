import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/area-distribution
// Area-wise distribution of shops, balances, recovery, and OB coverage.
//
// Query params:
//   - date: YYYY-MM-DD (default: today — for daily recovery)
//
// Response:
//   {
//     areas: [{ area, shopCount, totalBalance, todayRecovery, recoveryCount, obs: [names] }],
//     summary: { totalAreas, totalShops, totalBalance, totalRecovery }
//   }
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');

    const pool = getPool();

    // Calculate Pakistan day range
    const pkOffsetMs = 5 * 60 * 60 * 1000;
    const now = new Date();
    const pkNow = new Date(now.getTime() + pkOffsetMs);
    let startDate: Date, endDate: Date;

    if (dateStr) {
      const [year, month, day] = dateStr.split('-').map(Number);
      const startUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)).getTime() - pkOffsetMs;
      const endUTC = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)).getTime() - pkOffsetMs;
      startDate = new Date(startUTC);
      endDate = new Date(endUTC);
    } else {
      const todayStart = new Date(Date.UTC(pkNow.getUTCFullYear(), pkNow.getUTCMonth(), pkNow.getUTCDate(), 0, 0, 0, 0));
      startDate = new Date(todayStart.getTime() - pkOffsetMs);
      endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1);
    }

    // Get area-wise data in a single query
    const res = await pool.query(
      `SELECT
         COALESCE(s.area, 'Unknown') AS area,
         COUNT(DISTINCT s.id) AS "shopCount",
         COALESCE(SUM(s.balance), 0) AS "totalBalance",
         COALESCE(SUM(t_recovery.recovery_amount), 0) AS "todayRecovery",
         COUNT(DISTINCT t_recovery.id) AS "recoveryCount",
         ARRAY_AGG(DISTINCT u.name) FILTER (WHERE u.name IS NOT NULL) AS "obNames"
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       LEFT JOIN (
         SELECT "shopId", id, amount AS recovery_amount
         FROM "Transaction"
         WHERE type = 'recovery'
           AND status IN ('approved', 'pending')
           AND "createdAt" >= $1
           AND "createdAt" <= $2
       ) t_recovery ON s.id = t_recovery."shopId"
       WHERE s.status = 'active'
       GROUP BY COALESCE(s.area, 'Unknown')
       ORDER BY "shopCount" DESC`,
      [startDate, endDate]
    );

    const areas = res.rows.map((r: any) => ({
      area: r.area,
      shopCount: parseInt(r.shopCount),
      totalBalance: Math.round(Number(r.totalBalance) * 100) / 100,
      todayRecovery: Math.round(Number(r.todayRecovery) * 100) / 100,
      recoveryCount: parseInt(r.recoveryCount),
      obs: r.obNames || [],
    }));

    const summary = {
      totalAreas: areas.length,
      totalShops: areas.reduce((sum: number, a: any) => sum + a.shopCount, 0),
      totalBalance: Math.round(areas.reduce((sum: number, a: any) => sum + a.totalBalance, 0) * 100) / 100,
      totalRecovery: Math.round(areas.reduce((sum: number, a: any) => sum + a.todayRecovery, 0) * 100) / 100,
    };

    return NextResponse.json({ areas, summary });
  } catch (error) {
    console.error('[Area Distribution] Error:', error);
    return NextResponse.json({ error: 'Failed to generate area distribution report' }, { status: 500 });
  }
}
