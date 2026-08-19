import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/shops/needing-recovery?minDays=14&orderbookerId=xxx&companyId=xxx
// Returns shops where the last CREDIT is older than minDays AND recovery hasn't been done since
// A shop is "overdue" only if it received credit 14+ days ago and still hasn't recovered
// If companyId is provided, balance + companyName reflect that specific company's outstanding
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const minDays = parseInt(searchParams.get('minDays') || '14');
    const orderbookerId = searchParams.get('orderbookerId');
    const companyId = searchParams.get('companyId');

    const pool = getPool();

    const conditions: string[] = [`s.status = 'active'`, `s.balance > 0`];
    const params: any[] = [];
    let paramIndex = 1;

    if (orderbookerId) {
      conditions.push(`s."orderbookerId" = $${paramIndex++}`);
      params.push(orderbookerId);
    }

    // If companyId filter is set, restrict to shops that have outstanding balance for that company
    if (companyId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM "ShopCompanyBalance" scb
        WHERE scb."shopId" = s.id AND scb."companyId" = $${paramIndex++} AND scb.balance > 0
      )`);
      params.push(companyId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get shops with both their last credit date AND last recovery date
    const shopsRes = await pool.query(
      `SELECT s.id, s.name, s.area, s.address, s.balance, s."orderbookerId", s.phone,
              u.name AS "orderbookerName",
              lc.last_credit_date,
              lr.last_recovery_date,
              (SELECT string_agg(DISTINCT c.name, ', ')
               FROM "ShopCompanyBalance" scb
               JOIN "Company" c ON c.id = scb."companyId"
               WHERE scb."shopId" = s.id AND scb.balance > 0
               LIMIT 1) AS "companyName"
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       LEFT JOIN (
         SELECT "shopId", MAX("createdAt") AS last_credit_date
         FROM "Transaction"
         WHERE type = 'credit' AND status = 'approved'
         GROUP BY "shopId"
       ) lc ON s.id = lc."shopId"
       LEFT JOIN (
         SELECT "shopId", MAX("createdAt") AS last_recovery_date
         FROM "Transaction"
         WHERE type = 'recovery' AND status = 'approved'
         GROUP BY "shopId"
       ) lr ON s.id = lr."shopId"
       ${whereClause}
       ORDER BY lr.last_recovery_date ASC NULLS FIRST`,
      params
    );

    // Cutoff: minDays ago from now
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - minDays);

    // If companyId filter is set, we need per-company balance per shop
    let companyBalancesByShop: Record<string, Array<{ companyId: string; companyName: string; balance: number }>> = {};
    if (shopsRes.rows.length > 0) {
      const shopIds = shopsRes.rows.map((r: any) => r.id);
      const scbRes = await pool.query(
        `SELECT scb."shopId", scb."companyId", scb.balance, c.name AS "companyName"
         FROM "ShopCompanyBalance" scb
         JOIN "Company" c ON c.id = scb."companyId"
         WHERE scb."shopId" = ANY($1::text[]) AND scb.balance > 0
         ORDER BY scb.balance DESC`,
        [shopIds]
      );
      for (const row of scbRes.rows) {
        if (!companyBalancesByShop[row.shopId]) companyBalancesByShop[row.shopId] = [];
        companyBalancesByShop[row.shopId].push({
          companyId: row.companyId,
          companyName: row.companyName,
          balance: Number(row.balance),
        });
      }
    }

    const needingRecovery = shopsRes.rows.filter((s: any) => {
      // If shop has never had a credit, it cannot be overdue for recovery
      if (!s.last_credit_date) return false;

      const lastCredit = new Date(s.last_credit_date);
      // Credit must be older than minDays to be considered overdue
      if (lastCredit > cutoff) return false;

      // If no recovery at all, shop is overdue (credit is 14+ days old)
      if (!s.last_recovery_date) return true;

      // If last recovery is BEFORE last credit, the latest credit hasn't been recovered yet
      const lastRecovery = new Date(s.last_recovery_date);
      return lastRecovery <= lastCredit;
    }).map((s: any) => {
      const lastCredit = s.last_credit_date ? new Date(s.last_credit_date) : null;
      const lastRecovery = s.last_recovery_date ? new Date(s.last_recovery_date) : null;

      // Per-shop company balances (array)
      const shopCompanies = companyBalancesByShop[s.id] || [];

      // If companyId filter is set, balance should be that company's outstanding only
      // Otherwise, balance = shop's total balance (sum across all companies)
      let displayBalance = Number(s.balance);
      let displayCompanyName: string | null = s.companyName;

      if (companyId) {
        const match = shopCompanies.find(c => c.companyId === companyId);
        if (match) {
          displayBalance = match.balance;
          displayCompanyName = match.companyName;
        }
      }

      return {
        id: s.id,
        name: s.name,
        area: s.area,
        address: s.address,
        companyName: displayCompanyName,
        companyBalances: shopCompanies, // array of all companies with outstanding balance
        balance: displayBalance, // if companyId filter: that company's balance; else: shop total
        phone: s.phone,
        orderbookerId: s.orderbookerId,
        orderbookerName: s.orderbookerName,
        lastCreditDate: lastCredit ? lastCredit.toISOString() : null,
        lastRecoveryDate: lastRecovery ? lastRecovery.toISOString() : null,
        daysSinceCredit: lastCredit
          ? Math.floor((Date.now() - lastCredit.getTime()) / (1000 * 60 * 60 * 24))
          : null,
        daysSinceRecovery: lastRecovery
          ? Math.floor((Date.now() - lastRecovery.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      };
    });

    return NextResponse.json({
      minDays,
      count: needingRecovery.length,
      shops: needingRecovery,
    });
  } catch (error) {
    console.error('Error fetching shops needing recovery:', error);
    return NextResponse.json({ error: 'Failed to fetch shops needing recovery' }, { status: 500 });
  }
}
