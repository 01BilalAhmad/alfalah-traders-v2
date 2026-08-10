import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { ensureTallyTables } from '@/lib/tally-migrations';

// GET /api/tally/stale
// Returns shops whose last tally is older than their tallyFrequency window
// (or never tallied). Admin-only.
//
// tallyFrequency → stale threshold (days):
//   daily     → 1
//   weekly    → 7
//   monthly   → 30
//   quarterly → 90
//   none      → (excluded — no expectation)
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

    // Build a per-shop last-tally CTE, then filter against frequency thresholds.
    const res = await pool.query(
      `WITH last_tally AS (
         SELECT DISTINCT ON (st."shopId")
                st."shopId", st."tallyDate", st.status, st.difference,
                st."talliedBy", tu.name AS "tellerName"
         FROM "ShopTally" st
         LEFT JOIN "User" tu ON st."talliedBy" = tu.id
         WHERE (st."voided" IS NULL OR st."voided" = false)
         ORDER BY st."shopId", st."tallyDate" DESC
       )
       SELECT s.id AS "shopId", s.name AS "shopName", s.area,
              s."ownerName", s.phone, s.balance,
              s."tallyFrequency",
              s."orderbookerId", ob.name AS "orderbookerName",
              lt."tallyDate" AS "lastTallyDate",
              lt.status AS "lastTallyStatus",
              lt.difference AS "lastTallyDifference",
              lt."tellerName" AS "lastTallyTellerName",
              CASE
                WHEN lt."tallyDate" IS NULL THEN 99999
                ELSE EXTRACT(EPOCH FROM (NOW() - lt."tallyDate")) / 86400
              END AS "daysSinceTally"
       FROM "Shop" s
       LEFT JOIN last_tally lt ON lt."shopId" = s.id
       LEFT JOIN "User" ob ON s."orderbookerId" = ob.id
       WHERE s.status = 'active'
         AND COALESCE(s."tallyFrequency", 'monthly') != 'none'
         AND (
           lt."tallyDate" IS NULL
           OR (
             s."tallyFrequency" = 'daily'     AND EXTRACT(EPOCH FROM (NOW() - lt."tallyDate")) / 86400 > 1
           )
           OR (
             s."tallyFrequency" = 'weekly'    AND EXTRACT(EPOCH FROM (NOW() - lt."tallyDate")) / 86400 > 7
           )
           OR (
             s."tallyFrequency" = 'monthly'   AND EXTRACT(EPOCH FROM (NOW() - lt."tallyDate")) / 86400 > 30
           )
           OR (
             s."tallyFrequency" = 'quarterly' AND EXTRACT(EPOCH FROM (NOW() - lt."tallyDate")) / 86400 > 90
           )
         )
       ORDER BY "daysSinceTally" DESC, s.name ASC
       LIMIT 500`
    );

    const shops = res.rows.map((r: any) => ({
      shopId: r.shopId,
      shopName: r.shopName,
      area: r.area,
      ownerName: r.ownerName,
      phone: r.phone,
      balance: Number(r.balance) || 0,
      tallyFrequency: r.tallyFrequency || 'monthly',
      orderbookerId: r.orderbookerId,
      orderbookerName: r.orderbookerName,
      lastTallyDate: r.lastTallyDate instanceof Date ? r.lastTallyDate.toISOString() : r.lastTallyDate,
      lastTallyStatus: r.lastTallyStatus,
      lastTallyDifference: r.lastTallyDifference != null ? Number(r.lastTallyDifference) : null,
      lastTallyTellerName: r.lastTallyTellerName,
      daysSinceTally: r.lastTallyDate == null ? null : Math.floor(Number(r.daysSinceTally)),
      neverTallied: r.lastTallyDate == null,
    }));

    // Summary
    const neverTalliedCount = shops.filter((s: any) => s.neverTallied).length;
    const overdueCount = shops.length - neverTalliedCount;

    return NextResponse.json({
      shops,
      summary: {
        total: shops.length,
        neverTallied: neverTalliedCount,
        overdue: overdueCount,
      },
    });
  } catch (error) {
    console.error('[Tally Stale API] error:', error);
    return NextResponse.json({ error: 'Failed to fetch stale tallies' }, { status: 500 });
  }
}
