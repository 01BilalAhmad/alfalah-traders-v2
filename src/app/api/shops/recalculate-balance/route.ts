import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// POST /api/shops/recalculate-balance
// Recalculates shop balance from actual transactions (fixes corrupted balances)
export async function POST(request: NextRequest) {
  let client;
  try {
    const body = await request.json();
    const { shopId, shopName } = body;

    if (!shopId && !shopName) {
      return NextResponse.json({ error: 'Provide shopId or shopName' }, { status: 400 });
    }

    client = getPgClient();
    await client.connect();

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
      await client.end();
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
      const companyBalances = await client.query(
        `SELECT "companyId",
                COALESCE(SUM(CASE WHEN type = 'credit' AND status = 'approved' THEN amount ELSE 0 END), 0) AS total_credits,
                COALESCE(SUM(CASE WHEN type = 'recovery' AND status = 'approved' THEN amount ELSE 0 END), 0) AS total_recoveries
         FROM "Transaction"
         WHERE "shopId" = $1 AND "companyId" IS NOT NULL
         GROUP BY "companyId"`,
        [shop.id]
      );

      // Build a map of correct balances from transactions
      const correctBalances: Record<string, number> = {};
      for (const cb of companyBalances.rows) {
        const correctCompanyBalance = Math.round(
          (Number(cb.total_credits) - Number(cb.total_recoveries)) * 100
        ) / 100;
        correctBalances[cb.companyId] = correctCompanyBalance;
      }

      // Delete ALL existing ShopCompanyBalance rows for this shop first (clean slate)
      await client.query(
        `DELETE FROM "ShopCompanyBalance" WHERE "shopId" = $1`,
        [shop.id]
      );

      // Insert correct balances (only if > 0)
      for (const [companyId, balance] of Object.entries(correctBalances)) {
        if (balance > 0) {
          await client.query(
            `INSERT INTO "ShopCompanyBalance" ("shopId", "companyId", balance, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, NOW(), NOW())`,
            [shop.id, companyId, balance]
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

    await client.end();
    return NextResponse.json({ success: true, results });
  } catch (error) {
    if (client) {
      await client.end().catch(() => {});
    }
    console.error('Error recalculating balance:', error);
    return NextResponse.json({ error: 'Failed to recalculate balance' }, { status: 500 });
  }
}
