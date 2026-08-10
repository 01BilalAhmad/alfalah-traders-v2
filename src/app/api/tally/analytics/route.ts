import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { ensureTallyTables } from '@/lib/tally-migrations';

// GET /api/tally/analytics?days=30
// Returns discrepancy analytics: top shops, OB-wise rates, teller-wise rates,
// trend, reason code breakdown.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const pool = getPool();
    await ensureTallyTables();

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10) || 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // ─── Top shops by discrepancy count ──────────────────────────
    const topShopsRes = await pool.query(
      `SELECT s.id AS "shopId", s.name AS "shopName", s.area,
              COUNT(*)::int AS "discrepancyCount",
              SUM(st.difference)::float AS "totalDifference",
              AVG(ABS(st.difference))::float AS "avgDifference"
       FROM "ShopTally" st
       JOIN "Shop" s ON st."shopId" = s.id
       WHERE st.status = 'discrepancy'
         AND (st."voided" IS NULL OR st."voided" = false)
         AND st."tallyDate" >= $1
       GROUP BY s.id, s.name, s.area
       ORDER BY "discrepancyCount" DESC, "totalDifference" DESC
       LIMIT 10`,
      [since]
    );

    // ─── OB-wise discrepancy rate ────────────────────────────────
    const obRatesRes = await pool.query(
      `SELECT ob.id AS "orderbookerId", ob.name AS "orderbookerName",
              COUNT(*)::int AS "totalTallies",
              SUM(CASE WHEN st.status = 'discrepancy' THEN 1 ELSE 0 END)::int AS "discrepancies",
              ROUND(
                100.0 * SUM(CASE WHEN st.status = 'discrepancy' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
                2
              )::float AS "discrepancyRate",
              SUM(st.difference)::float AS "totalDifference"
       FROM "ShopTally" st
       JOIN "User" ob ON st."orderbookerId" = ob.id
       WHERE (st."voided" IS NULL OR st."voided" = false)
         AND st."tallyDate" >= $1
       GROUP BY ob.id, ob.name
       HAVING COUNT(*) >= 1
       ORDER BY "discrepancyRate" DESC NULLS LAST
       LIMIT 20`,
      [since]
    );

    // ─── Teller-wise discrepancy rate ────────────────────────────
    const tellerRatesRes = await pool.query(
      `SELECT tu.id AS "tellerId", tu.name AS "tellerName",
              COUNT(*)::int AS "totalTallies",
              SUM(CASE WHEN st.status = 'discrepancy' THEN 1 ELSE 0 END)::int AS "discrepancies",
              ROUND(
                100.0 * SUM(CASE WHEN st.status = 'discrepancy' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
                2
              )::float AS "discrepancyRate",
              SUM(st.difference)::float AS "totalDifference"
       FROM "ShopTally" st
       JOIN "User" tu ON st."talliedBy" = tu.id
       WHERE (st."voided" IS NULL OR st."voided" = false)
         AND st."tallyDate" >= $1
       GROUP BY tu.id, tu.name
       ORDER BY "discrepancyRate" DESC NULLS LAST
       LIMIT 20`,
      [since]
    );

    // ─── Reason code breakdown ───────────────────────────────────
    const reasonRes = await pool.query(
      `SELECT st."reasonCode",
              COUNT(*)::int AS "count",
              SUM(ABS(st.difference))::float AS "totalAbsDifference"
       FROM "ShopTally" st
       WHERE st.status = 'discrepancy'
         AND (st."voided" IS NULL OR st."voided" = false)
         AND st."tallyDate" >= $1
       GROUP BY st."reasonCode"
       ORDER BY "count" DESC`,
      [since]
    );

    // ─── Daily trend (last N days) ───────────────────────────────
    const trendRes = await pool.query(
      `SELECT DATE(st."tallyDate") AS day,
              COUNT(*)::int AS "total",
              SUM(CASE WHEN st.status = 'discrepancy' THEN 1 ELSE 0 END)::int AS "discrepancies",
              SUM(CASE WHEN st.status = 'verified' THEN 1 ELSE 0 END)::int AS "verified",
              SUM(st.difference)::float AS "netDifference"
       FROM "ShopTally" st
       WHERE (st."voided" IS NULL OR st."voided" = false)
         AND st."tallyDate" >= $1
       GROUP BY DATE(st."tallyDate")
       ORDER BY day ASC`,
      [since]
    );

    // ─── GPS verification stats ──────────────────────────────────
    const gpsStatsRes = await pool.query(
      `SELECT st."locationStatus",
              COUNT(*)::int AS "count"
       FROM "ShopTally" st
       WHERE (st."voided" IS NULL OR st."voided" = false)
         AND st."tallyDate" >= $1
       GROUP BY st."locationStatus"`,
      [since]
    );

    // ─── Repeat discrepancy shops (3+ discrepancies) ─────────────
    const repeatRes = await pool.query(
      `SELECT s.id AS "shopId", s.name AS "shopName", s.area,
              COUNT(*)::int AS "discrepancyCount",
              MAX(st."tallyDate") AS "lastDiscrepancyDate"
       FROM "ShopTally" st
       JOIN "Shop" s ON st."shopId" = s.id
       WHERE st.status = 'discrepancy'
         AND (st."voided" IS NULL OR st."voided" = false)
         AND st."tallyDate" >= $1
       GROUP BY s.id, s.name, s.area
       HAVING COUNT(*) >= 3
       ORDER BY "discrepancyCount" DESC
       LIMIT 50`,
      [since]
    );

    return NextResponse.json({
      period: { days, since },
      topShops: topShopsRes.rows.map((r: any) => ({
        shopId: r.shopId,
        shopName: r.shopName,
        area: r.area,
        discrepancyCount: r.discrepancyCount,
        totalDifference: Number(r.totalDifference) || 0,
        avgDifference: Number(r.avgDifference) || 0,
      })),
      orderbookerRates: obRatesRes.rows.map((r: any) => ({
        orderbookerId: r.orderbookerId,
        orderbookerName: r.orderbookerName,
        totalTallies: r.totalTallies,
        discrepancies: r.discrepancies,
        discrepancyRate: Number(r.discrepancyRate) || 0,
        totalDifference: Number(r.totalDifference) || 0,
      })),
      tellerRates: tellerRatesRes.rows.map((r: any) => ({
        tellerId: r.tellerId,
        tellerName: r.tellerName,
        totalTallies: r.totalTallies,
        discrepancies: r.discrepancies,
        discrepancyRate: Number(r.discrepancyRate) || 0,
        totalDifference: Number(r.totalDifference) || 0,
      })),
      reasonBreakdown: reasonRes.rows.map((r: any) => ({
        reasonCode: r.reasonCode || 'unspecified',
        count: r.count,
        totalAbsDifference: Number(r.totalAbsDifference) || 0,
      })),
      trend: trendRes.rows.map((r: any) => ({
        day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : r.day,
        total: r.total,
        discrepancies: r.discrepancies,
        verified: r.verified,
        netDifference: Number(r.netDifference) || 0,
      })),
      gpsStats: gpsStatsRes.rows.map((r: any) => ({
        locationStatus: r.locationStatus || 'unverified',
        count: r.count,
      })),
      repeatShops: repeatRes.rows.map((r: any) => ({
        shopId: r.shopId,
        shopName: r.shopName,
        area: r.area,
        discrepancyCount: r.discrepancyCount,
        lastDiscrepancyDate: r.lastDiscrepancyDate instanceof Date ? r.lastDiscrepancyDate.toISOString() : r.lastDiscrepancyDate,
      })),
    });
  } catch (error) {
    console.error('[Tally Analytics API] error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
