import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';

// POST /api/tally/fix-resolved-balances
// Admin-only: One-time fix for already-resolved tally adjustments that were
// created WITHOUT a companyId. This script:
//
//   1. Finds all "Balance Adjustment — Tally Resolution" transactions with companyId = NULL
//   2. Assigns them to the specified company (from request body or auto-detect)
//   3. Runs recalcShopBalances for each affected shop
//   4. Returns summary of what was fixed
//
// Body: { companyName?: string }  — e.g., "CBL LU Biscuits"
// If companyName not provided, uses the shop's first/default company
//
// SAFE: Only updates adjustment transactions (description LIKE 'Balance Adjustment%')
// Does NOT touch any other transactions.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const targetCompanyName = body.companyName?.trim();

    const pool = getPool();

    // 1. Find the target company (by name if provided)
    let targetCompanyId: string | null = null;
    let targetCompanyFound = '';

    if (targetCompanyName) {
      const compRes = await pool.query(
        `SELECT id, name FROM "Company" WHERE name ILIKE $1 LIMIT 1`,
        [`%${targetCompanyName}%`]
      );
      if (compRes.rows.length === 0) {
        return NextResponse.json({
          error: `Company not found: '${targetCompanyName}'`
        }, { status: 404 });
      }
      targetCompanyId = compRes.rows[0].id;
      targetCompanyFound = compRes.rows[0].name;
    }

    // 2. Find all adjustment transactions with NULL companyId
    const adjTxnsRes = await pool.query(
      `SELECT t.id, t."shopId", t.amount, t.type, t.description,
              t."previousBalance", t."newBalance",
              s.name AS "shopName"
       FROM "Transaction" t
       JOIN "Shop" s ON t."shopId" = s.id
       WHERE t.description LIKE 'Balance Adjustment%'
         AND t."companyId" IS NULL
         AND t.status = 'approved'
       ORDER BY t."createdAt" ASC`
    );

    if (adjTxnsRes.rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No adjustment transactions with NULL companyId found. Nothing to fix.',
        fixed: 0,
      });
    }

    const { recalcShopBalances } = await import('@/lib/recalc-balances');

    let fixedTxns = 0;
    let fixedShops = 0;
    let skipped = 0;
    let failed = 0;
    const results: any[] = [];

    // Group by shopId so we recalc once per shop
    const shopTxnMap = new Map<string, any[]>();
    for (const txn of adjTxnsRes.rows) {
      if (!shopTxnMap.has(txn.shopId)) {
        shopTxnMap.set(txn.shopId, []);
      }
      shopTxnMap.get(txn.shopId)!.push(txn);
    }

    for (const [shopId, txns] of shopTxnMap) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Determine which companyId to use for this shop
        let useCompanyId = targetCompanyId;

        if (!useCompanyId) {
          // Auto-detect: find the shop's company from ShopCompanyBalance
          const scbRes = await client.query(
            `SELECT "companyId" FROM "ShopCompanyBalance"
             WHERE "shopId" = $1 ORDER BY balance DESC LIMIT 1`,
            [shopId]
          );
          if (scbRes.rows.length > 0) {
            useCompanyId = scbRes.rows[0].companyId;
          } else {
            // Try ShopOrderbooker table
            const soRes = await client.query(
              `SELECT "companyId" FROM "ShopOrderbooker"
               WHERE "shopId" = $1 ORDER BY "createdAt" ASC LIMIT 1`,
              [shopId]
            );
            if (soRes.rows.length > 0) {
              useCompanyId = soRes.rows[0].companyId;
            }
          }
        }

        if (!useCompanyId) {
          skipped += txns.length;
          results.push({
            shopId, shopName: txns[0].shopName, txnCount: txns.length,
            status: 'skipped', reason: 'No company found for this shop',
          });
          await client.query('ROLLBACK');
          continue;
        }

        // Get company name for logging
        const compNameRes = await client.query(
          `SELECT name FROM "Company" WHERE id = $1`, [useCompanyId]
        );
        const compName = compNameRes.rows[0]?.name || useCompanyId;

        // Update all adjustment transactions for this shop — set companyId
        let txnCount = 0;
        for (const txn of txns) {
          await client.query(
            `UPDATE "Transaction" SET "companyId" = $1 WHERE id = $2`,
            [useCompanyId, txn.id]
          );
          txnCount++;
          fixedTxns++;
        }

        // Recalculate shop balances (Shop.balance + ShopCompanyBalance + running balances)
        await recalcShopBalances(client, shopId);

        await client.query('COMMIT');
        fixedShops++;

        // Get new balances for reporting
        const afterRes = await client.query(
          `SELECT s.balance,
                  COALESCE(scb.balance, 0) AS "companyBalance"
           FROM "Shop" s
           LEFT JOIN "ShopCompanyBalance" scb
             ON scb."shopId" = s.id AND scb."companyId" = $1
           WHERE s.id = $2`,
          [useCompanyId, shopId]
        );

        results.push({
          shopId, shopName: txns[0].shopName, txnCount,
          companyAssigned: compName,
          newShopBalance: Number(afterRes.rows[0]?.balance) || 0,
          newCompanyBalance: Number(afterRes.rows[0]?.companyBalance) || 0,
          status: 'fixed',
        });
      } catch (err) {
        await client.query('ROLLBACK');
        failed++;
        results.push({
          shopId, shopName: txns[0].shopName,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        client.release();
      }
    }

    return NextResponse.json({
      success: true,
      targetCompany: targetCompanyFound || 'auto-detected per shop',
      totalAdjustmentTxns: adjTxnsRes.rows.length,
      totalShops: shopTxnMap.size,
      fixedTxns, fixedShops, skipped, failed,
      results,
    });
  } catch (error) {
    console.error('[Fix Resolved Balances API] error:', error);
    return NextResponse.json({ error: 'Failed to fix resolved balances' }, { status: 500 });
  }
}
