/**
 * Recalculate shop balances from transactions.
 *
 * When a backdated transaction is added/edited/deleted, the running balances
 * (previousBalance, newBalance on each Transaction) and aggregate balances
 * (Shop.balance, ShopCompanyBalance.balance) become stale because the original
 * entry only updated the balances at the time of insertion, not retroactively.
 *
 * This function:
 *   1. Fetches all approved transactions for the shop ordered by createdAt ASC
 *   2. Recalculates previousBalance + newBalance for each (running balance)
 *   3. Recomputes ShopCompanyBalance per (shopId, companyId)
 *   4. Sets Shop.balance = sum of all company balances (so they always match)
 *
 * MUST be called inside an active transaction (client passed in).
 * Non-approved transactions (pending/rejected) get prev=new=current (no effect).
 */

import { PoolClient } from 'pg';

interface RecalcResult {
  shopId: string;
  transactionsUpdated: number;
  newShopBalance: number;
  companyBalancesUpdated: number;
}

export async function recalcShopBalances(
  client: PoolClient,
  shopId: string
): Promise<RecalcResult> {
  // 1. Fetch ALL transactions for this shop, ordered by createdAt ASC.
  //    Pending/rejected transactions don't affect balance but we still update
  //    their prev/new to reflect the running balance at that point (for UI).
  const txnsRes = await client.query(
    `SELECT id, type, status, amount, "companyId", "createdAt"
     FROM "Transaction"
     WHERE "shopId" = $1
     ORDER BY "createdAt" ASC, id ASC`,
    [shopId]
  );

  // 2. Compute running balance + per-company totals
  let runningBalance = 0;
  const companyTotals: Record<string, { credit: number; recovery: number; claim: number }> = {};
  let transactionsUpdated = 0;

  for (const t of txnsRes.rows) {
    const amount = Number(t.amount);
    const isApproved = t.status === 'approved';
    const companyId = t.companyId;

    const prevBalance = runningBalance;

    if (isApproved) {
      if (t.type === 'credit') {
        runningBalance += amount;
      } else if (t.type === 'recovery' || t.type === 'supplier_collection') {
        runningBalance -= amount;
      } else if (t.type === 'claim') {
        runningBalance -= amount;
      }

      // Track per-company totals (only for transactions with a companyId)
      if (companyId) {
        if (!companyTotals[companyId]) {
          companyTotals[companyId] = { credit: 0, recovery: 0, claim: 0, supplier_collection: 0 };
        }
        if (t.type === 'credit') companyTotals[companyId].credit += amount;
        else if (t.type === 'recovery') companyTotals[companyId].recovery += amount;
        else if (t.type === 'supplier_collection') companyTotals[companyId].supplier_collection += amount;
        else if (t.type === 'claim') companyTotals[companyId].claim += amount;
      }
    }

    const newBalance = runningBalance;

    // Update the transaction's prev/new balance (round to 2 decimals)
    const prevRounded = Math.round(prevBalance * 100) / 100;
    const newRounded = Math.round(newBalance * 100) / 100;

    await client.query(
      `UPDATE "Transaction"
       SET "previousBalance" = $1, "newBalance" = $2
       WHERE id = $3`,
      [prevRounded, newRounded, t.id]
    );
    transactionsUpdated++;
  }

  // 3. Compute correct per-company balances
  //    For each company that has transactions, balance = credit - recovery - claim
  //    For companies with ShopCompanyBalance but no transactions, keep existing
  const correctCompanyBalances: Record<string, number> = {};
  for (const [compId, totals] of Object.entries(companyTotals)) {
    correctCompanyBalances[compId] =
      Math.round((totals.credit - totals.recovery - totals.supplier_collection - totals.claim) * 100) / 100;
  }

  // 4. Update ShopCompanyBalance entries
  //    - For companies in correctCompanyBalances: update balance
  //    - For companies with existing ShopCompanyBalance but not in correctCompanyBalances:
  //      leave them alone (they may have been set via bulk-import or other means)
  let companyBalancesUpdated = 0;
  for (const [compId, balance] of Object.entries(correctCompanyBalances)) {
    try {
      const existing = await client.query(
        `SELECT id FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND "companyId" = $2`,
        [shopId, compId]
      );

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE "ShopCompanyBalance"
           SET balance = $1, "updatedAt" = NOW()
           WHERE "shopId" = $2 AND "companyId" = $3`,
          [balance, shopId, compId]
        );
      } else {
        // Create new entry if it doesn't exist
        await client.query(
          `INSERT INTO "ShopCompanyBalance" (id, "shopId", "companyId", balance, "creditLimit", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, 0, NOW(), NOW())`,
          [shopId, compId, balance]
        );
      }
      companyBalancesUpdated++;
    } catch (err) {
      console.warn(`[recalcShopBalances] Failed to update ShopCompanyBalance for company ${compId}:`, err);
    }
  }

  // 5. Compute new Shop.balance
  // ── FIX C3: Use runningBalance (computed from ALL approved transactions,
  //    including those with NULL companyId), NOT the SUM of ShopCompanyBalance.
  //
  // Previously we set Shop.balance = SUM(SCB), which silently dropped the
  // effect of any transaction with companyId = NULL (legacy data, claims
  // without company, etc.). This caused Shop.balance to diverge from the
  // sum of its transaction history.
  //
  // Now: Shop.balance = runningBalance (the true running total of all
  // approved credits/recoveries/claims).
  //
  // Note: ShopCompanyBalance is still updated per-company for companies that
  // HAVE a companyId. Transactions with NULL companyId affect Shop.balance
  // but not any ShopCompanyBalance (which is correct — they don't belong to
  // any specific company).
  const newShopBalance = Math.round(runningBalance * 100) / 100;

  await client.query(
    `UPDATE "Shop" SET balance = $1, "updatedAt" = NOW() WHERE id = $2`,
    [newShopBalance, shopId]
  );

  return {
    shopId,
    transactionsUpdated,
    newShopBalance,
    companyBalancesUpdated,
  };
}
