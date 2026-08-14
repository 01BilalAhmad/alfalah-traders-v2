import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';

// POST /api/tally/fix-balances
// Admin-only: One-time fix for shops that were resolved but ShopCompanyBalance
// was not updated. This script:
//   1. Finds all resolved discrepancy tallies
//   2. For each shop, calls recalcShopBalances to fix ShopCompanyBalance
//   3. Returns summary of what was fixed
//
// SAFE: Only reads + recalculates. Does NOT create new transactions.
// Does NOT change Shop.balance (recalcShopBalances sets it = running balance
// which should already be correct from the resolve step).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const pool = getPool();

    // 1. Find all resolved discrepancy tallies (unique shopIds)
    const resolvedRes = await pool.query(
      `SELECT DISTINCT st."shopId", s.name AS "shopName"
       FROM "ShopTally" st
       JOIN "Shop" s ON st."shopId" = s.id
       WHERE st.status = 'discrepancy'
         AND st."resolutionStatus" = 'resolved'
         AND (st."voided" IS NULL OR st."voided" = false)
       ORDER BY s.name ASC`
    );

    const { recalcShopBalances } = await import('@/lib/recalc-balances');

    let fixed = 0;
    let skipped = 0;
    let failed = 0;
    const results: any[] = [];

    for (const row of resolvedRes.rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Get current balances before recalc
        const beforeRes = await client.query(
          `SELECT s.balance AS "shopBalance",
                  COALESCE(SUM(scb.balance), 0) AS "companyBalanceSum"
           FROM "Shop" s
           LEFT JOIN "ShopCompanyBalance" scb ON scb."shopId" = s.id
           WHERE s.id = $1
           GROUP BY s.balance`,
          [row.shopId]
        );
        const beforeShop = Number(beforeRes.rows[0]?.shopBalance) || 0;
        const beforeCompany = Number(beforeRes.rows[0]?.companyBalanceSum) || 0;

        // Run recalc
        const result = await recalcShopBalances(client, row.shopId);

        // Get balances after recalc
        const afterRes = await client.query(
          `SELECT s.balance AS "shopBalance",
                  COALESCE(SUM(scb.balance), 0) AS "companyBalanceSum"
           FROM "Shop" s
           LEFT JOIN "ShopCompanyBalance" scb ON scb."shopId" = s.id
           WHERE s.id = $1
           GROUP BY s.balance`,
          [row.shopId]
        );
        const afterShop = Number(afterRes.rows[0]?.shopBalance) || 0;
        const afterCompany = Number(afterRes.rows[0]?.companyBalanceSum) || 0;

        const wasFixed = Math.abs(beforeCompany - afterCompany) >= 0.01;

        await client.query('COMMIT');

        if (wasFixed) {
          fixed++;
        } else {
          skipped++;
        }

        results.push({
          shopId: row.shopId,
          shopName: row.shopName,
          before: { shopBalance: beforeShop, companyBalanceSum: beforeCompany },
          after: { shopBalance: afterShop, companyBalanceSum: afterCompany },
          changed: wasFixed,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        failed++;
        results.push({
          shopId: row.shopId,
          shopName: row.shopName,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        client.release();
      }
    }

    return NextResponse.json({
      success: true,
      totalShops: resolvedRes.rows.length,
      fixed,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    console.error('[Fix Balances API] error:', error);
    return NextResponse.json({ error: 'Failed to fix balances' }, { status: 500 });
  }
}
