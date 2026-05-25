import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/pg';
import crypto from 'crypto';

// POST /api/shops/recalculate-balance
// Recalculates shop balance from actual transactions (fixes corrupted balances)
export async function POST(request: NextRequest) {
  const client = await getClient();
  try {
    const body = await request.json();
    const { shopId, shopName } = body;

    if (!shopId && !shopName) {
      return NextResponse.json({ error: 'Provide shopId or shopName' }, { status: 400 });
    }

    await client.query('BEGIN');

    // Find the shop
    let shopQuery: string;
    let shopParams: any[];
    if (shopId) {
      shopQuery = `SELECT id, name, balance FROM "Shop" WHERE id = $1`;
      shopParams = [shopId];
    } else {
      shopQuery = `SELECT id, name, balance FROM "Shop" WHERE name ILIKE $1`;
      shopParams = [`%${shopName}%`];
    }

    const shopRes = await client.query(shopQuery, shopParams);
    if (shopRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const results = [];

    for (const shop of shopRes.rows) {
      // Calculate correct balance from transactions
      // Credit (approved) adds to balance, Recovery (approved) deducts from balance
      const calcRes = await client.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN type = 'credit' AND status = 'approved' THEN amount ELSE 0 END), 0) AS total_credits,
           COALESCE(SUM(CASE WHEN type = 'recovery' AND status = 'approved' THEN amount ELSE 0 END), 0) AS total_recoveries
         FROM "Transaction" 
         WHERE "shopId" = $1`,
        [shop.id]
      );

      const correctBalance = Math.round(
        (Number(calcRes.rows[0].total_credits) - Number(calcRes.rows[0].total_recoveries)) * 100
      ) / 100;

      const oldBalance = Number(shop.balance);

      // Update shop balance
      await client.query(
        `UPDATE "Shop" SET balance = $1 WHERE id = $2`,
        [correctBalance, shop.id]
      );

      // Also recalculate ShopCompanyBalance
      // First, for transactions WITH companyId — use them directly
      const companyBalances = await client.query(
        `SELECT "companyId",
                COALESCE(SUM(CASE WHEN type = 'credit' AND status = 'approved' THEN amount ELSE 0 END), 0) AS total_credits,
                COALESCE(SUM(CASE WHEN type = 'recovery' AND status = 'approved' THEN amount ELSE 0 END), 0) AS total_recoveries
         FROM "Transaction"
         WHERE "shopId" = $1 AND "companyId" IS NOT NULL
         GROUP BY "companyId"`,
        [shop.id]
      );

      // Build a map of correct balances from transactions WITH companyId
      const correctBalances: Record<string, number> = {};
      for (const cb of companyBalances.rows) {
        const correctCompanyBalance = Math.round(
          (Number(cb.total_credits) - Number(cb.total_recoveries)) * 100
        ) / 100;
        correctBalances[cb.companyId] = correctCompanyBalance;
      }

      // For transactions WITHOUT companyId (e.g., old admin recoveries),
      // try to infer the companyId from the shop's orderbooker or existing ShopCompanyBalance
      const orphanTxns = await client.query(
        `SELECT id, type, amount FROM "Transaction"
         WHERE "shopId" = $1 AND "companyId" IS NULL AND status = 'approved'`,
        [shop.id]
      );

      if (orphanTxns.rows.length > 0) {
        // Try to find the shop's orderbooker's companyId
        let inferredCompanyId: string | null = null;
        try {
          const obRes = await client.query(
            `SELECT u."companyId" FROM "Shop" s
             LEFT JOIN "User" u ON s."orderbookerId" = u.id
             WHERE s.id = $1`,
            [shop.id]
          );
          if (obRes.rows.length > 0 && obRes.rows[0].companyId) {
            inferredCompanyId = obRes.rows[0].companyId;
          }
        } catch { /* non-blocking */ }

        // Fallback: try existing ShopCompanyBalance
        if (!inferredCompanyId) {
          try {
            const scbRes = await client.query(
              'SELECT "companyId" FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND balance > 0 LIMIT 1',
              [shop.id]
            );
            if (scbRes.rows.length > 0) {
              inferredCompanyId = scbRes.rows[0].companyId;
            }
          } catch { /* non-blocking */ }
        }

        if (inferredCompanyId) {
          // Apply orphan transactions to the inferred company
          for (const txn of orphanTxns.rows) {
            if (!correctBalances[inferredCompanyId]) {
              correctBalances[inferredCompanyId] = 0;
            }
            if (txn.type === 'credit') {
              correctBalances[inferredCompanyId] += Number(txn.amount);
            } else if (txn.type === 'recovery') {
              correctBalances[inferredCompanyId] -= Number(txn.amount);
            }
            // Also update the transaction record with the inferred companyId
            await client.query(
              'UPDATE "Transaction" SET "companyId" = $1 WHERE id = $2',
              [inferredCompanyId, txn.id]
            );
          }
          correctBalances[inferredCompanyId] = Math.round(correctBalances[inferredCompanyId] * 100) / 100;
        }
      }

      // Delete ALL existing ShopCompanyBalance rows for this shop first (clean slate)
      await client.query(
        `DELETE FROM "ShopCompanyBalance" WHERE "shopId" = $1`,
        [shop.id]
      );

      // Insert correct balances (only if > 0)
      for (const [companyId, balance] of Object.entries(correctBalances)) {
        if (balance > 0) {
          const scbId = `scb_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
          await client.query(
            `INSERT INTO "ShopCompanyBalance" (id, "shopId", "companyId", balance, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [scbId, shop.id, companyId, balance]
          );
        }
      }

      results.push({
        shopId: shop.id,
        shopName: shop.name,
        oldBalance,
        correctBalance,
        totalCredits: Number(calcRes.rows[0].total_credits),
        totalRecoveries: Number(calcRes.rows[0].total_recoveries),
        fixed: oldBalance !== correctBalance,
      });
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error recalculating balance:', error);
    return NextResponse.json({ 
      error: 'Failed to recalculate balance', 
      detail: error?.message || String(error),
      stack: error?.code || undefined
    }, { status: 500 });
  } finally {
    client.release();
  }
}
