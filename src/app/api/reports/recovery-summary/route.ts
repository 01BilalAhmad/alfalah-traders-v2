import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';
import { getPool } from '@/lib/pg';

// GET /api/reports/recovery-summary?date=xxx&companyId=yyy
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const companyId = searchParams.get('companyId') || undefined;

    const today = new Date();

    let startDate: Date;
    let endDate: Date;
    let displayDate: string;

    if (dateStr) {
      displayDate = dateStr;
      // Use the full UTC day for filtering (Neon stores timestamps in UTC)
      const [year, month, day] = dateStr.split('-').map(Number);
      startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    } else {
      // Use current date in UTC for filtering
      const year = today.getUTCFullYear();
      const month = today.getUTCMonth();
      const day = today.getUTCDate();
      startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
      displayDate = `${String(year)}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const pool = getPool();
    const result = await generateReport(pool, startDate, endDate, displayDate, companyId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating recovery summary:', error);
    return NextResponse.json({ error: 'Failed to generate recovery summary' }, { status: 500 });
  }
}

interface ShopCompanyBreakdown {
  companyId: string;
  companyName: string;
  previousBalance: number;
  todayCredit: number;
  todayRecovery: number;
  closingBalance: number;
}

interface ShopRecovery {
  shopId: string;
  shopName: string;
  shopArea: string | null;
  shopAddress: string | null;
  companyId: string | null;
  previousBalance: number;
  todayCredit: number;
  todayRecovery: number;
  closingBalance: number;
  visited: boolean;
  companyBreakdown: ShopCompanyBreakdown[];
  recoveryEntries: Array<{
    id: string;
    amount: number;
    time: string;
    description: string | null;
    hasGps: boolean;
    gpsLat: number | null;
    gpsLng: number | null;
  }>;
}

interface CompanyBreakdown {
  companyId: string;
  companyName: string;
  totalRecovery: number;
  shops: number;
}

async function generateReport(
  pool: pg.Pool,
  startDate: Date,
  endDate: Date,
  displayDate: string,
  companyId?: string
) {
  // Get all active orderbookers
  const obRes = await pool.query(
    'SELECT id, name, phone FROM "User" WHERE role = \'orderbooker\' AND status = \'active\' ORDER BY name ASC'
  );
  const orderbookers = obRes.rows;

  const recoverySummary = await Promise.all(
    orderbookers.map(async (ob) => {
      // Get primary shops for this orderbooker
      const primaryShopRes = await pool.query(
        'SELECT id, name, area, address, balance FROM "Shop" WHERE "orderbookerId" = $1 AND status = \'active\' ORDER BY name ASC',
        [ob.id]
      );
      const primaryShops = primaryShopRes.rows.map((s: { id: string; name: string; area: string | null; address: string | null; balance: number }) => ({
        ...s,
        companyId: null as string | null,
        isSecondary: false,
      }));

      // Get secondary shops for this orderbooker (via ShopOrderbooker)
      const secondaryShopRes = await pool.query(
        `SELECT s.id, s.name, s.area, s.address, s.balance, so."companyId", so."routeDays"
         FROM "ShopOrderbooker" so
         JOIN "Shop" s ON s.id = so."shopId"
         WHERE so."orderbookerId" = $1 AND s.status = 'active'
         ORDER BY s.name ASC`,
        [ob.id]
      );
      const secondaryShops = secondaryShopRes.rows.map((s: { id: string; name: string; area: string | null; address: string | null; balance: number; companyId: string; routeDays: string }) => ({
        id: s.id,
        name: s.name,
        area: s.area,
        address: s.address,
        balance: s.balance,
        companyId: s.companyId,
        isSecondary: true,
        routeDays: s.routeDays || [],
      }));

      // Merge shops, avoiding duplicates (a shop shouldn't appear as both primary and secondary
      // for the same orderbooker, but we use a Map to be safe)
      const shopMap = new Map<string, { id: string; name: string; area: string | null; address: string | null; balance: number; companyId: string | null; isSecondary: boolean }>();

      // Add secondary shops first (they have companyId info)
      for (const s of secondaryShops) {
        shopMap.set(`${s.id}_${s.companyId}`, s);
      }
      // Add primary shops (skip if already present as a secondary assignment for the same shop)
      for (const s of primaryShops) {
        const key = `${s.id}_null`;
        const alreadyExists = Array.from(shopMap.keys()).some(k => k.startsWith(`${s.id}_`));
        if (!alreadyExists) {
          shopMap.set(key, s);
        }
      }

      const allShops = Array.from(shopMap.values());

      // Build transaction query parameters
      // Optional companyId filter for transactions
      const shopRecoveries: ShopRecovery[] = [];

      for (const shop of allShops) {
        // Build transaction query with optional companyId filter
        // EXCLUDE 'Balance Adjustment' entries — these are tally resolution
        // adjustments, NOT actual recoveries by orderbookers. They should
        // only appear in Company Report / Ledger, not in OB Recovery Report.
        let txnQuery = `SELECT id, type, amount, "previousBalance", "newBalance", "createdAt", description, "gpsLat", "gpsLng", "companyId"
             FROM "Transaction"
             WHERE "shopId" = $1 AND "createdAt" >= $2 AND "createdAt" <= $3 AND status = 'approved'
             AND (description IS NULL OR description NOT LIKE '%Balance Adjustment%')`;
        const txnParams: (string | Date)[] = [shop.id, startDate.toISOString(), endDate.toISOString()];

        if (companyId) {
          txnQuery += ` AND "companyId" = $4`;
          txnParams.push(companyId);
        }

        txnQuery += ` ORDER BY "createdAt" DESC`;

        const txnRes = await pool.query(txnQuery, txnParams);
        const dayTxns = txnRes.rows;

        // Also fetch pending transactions to determine visited status
        let pendingQuery = `SELECT id FROM "Transaction"
             WHERE "shopId" = $1 AND "createdAt" >= $2 AND "createdAt" <= $3 AND status = 'pending' AND type = 'recovery'`;
        const pendingParams: (string | Date)[] = [shop.id, startDate.toISOString(), endDate.toISOString()];

        if (companyId) {
          pendingQuery += ` AND "companyId" = $4`;
          pendingParams.push(companyId);
        }

        pendingQuery += ` LIMIT 1`;

        const pendingRes = await pool.query(pendingQuery, pendingParams);
        const hasPendingRecovery = pendingRes.rows.length > 0;

        const todayCredit = dayTxns.filter((t: { type: string; amount: number }) => t.type === 'credit').reduce((s: number, t: { amount: number }) => s + t.amount, 0);
        const recoveryTxns = dayTxns.filter((t: { type: string }) => t.type === 'recovery');
        const todayRecovery = recoveryTxns.reduce((s: number, t: { amount: number }) => s + t.amount, 0);
        const prevBalance = dayTxns.length > 0 ? dayTxns[dayTxns.length - 1].previousBalance : shop.balance;

        const recoveryEntries = recoveryTxns.map((t: { id: string; amount: number; createdAt: string; description: string | null; gpsLat: number | null; gpsLng: number | null }) => ({
          id: t.id,
          amount: Math.round(t.amount * 100) / 100,
          time: t.createdAt,
          description: t.description,
          hasGps: !!(t.gpsLat && t.gpsLng),
          gpsLat: t.gpsLat,
          gpsLng: t.gpsLng,
        }));

        // ── Build company-wise breakdown for this shop ──
        // 1. Get ShopCompanyBalance entries for per-company current balances
        const scbRes = await pool.query(
          `SELECT "companyId", balance FROM "ShopCompanyBalance" WHERE "shopId" = $1`,
          [shop.id]
        );
        const shopCompanyBalances: Record<string, number> = {};
        for (const row of scbRes.rows) {
          shopCompanyBalances[row.companyId] = Number(row.balance);
        }

        // 2. Group today's transactions by companyId
        const txnByCompany = new Map<string, { credit: number; recovery: number }>();
        for (const t of dayTxns) {
          const cid = t.companyId || '_none_';
          const existing = txnByCompany.get(cid) || { credit: 0, recovery: 0 };
          if (t.type === 'credit') existing.credit += Number(t.amount);
          else if (t.type === 'recovery') existing.recovery += Number(t.amount);
          txnByCompany.set(cid, existing);
        }

        // 3. Build company breakdown array
        const companyBreakdown: ShopCompanyBreakdown[] = [];

        // Get company names for this shop's companies
        const shopCompanyIds = Object.keys(shopCompanyBalances);
        if (shopCompanyIds.length > 0) {
          const compNameRes = await pool.query(
            `SELECT id, name FROM "Company" WHERE id = ANY($1::text[])`,
            [shopCompanyIds]
          );
          const compNameMap: Record<string, string> = {};
          for (const row of compNameRes.rows) {
            compNameMap[row.id] = row.name;
          }

          for (const cid of shopCompanyIds) {
            const compTxns = txnByCompany.get(cid) || { credit: 0, recovery: 0 };
            const currentBal = shopCompanyBalances[cid] || 0;
            // True previous balance = current balance - today's credit + today's recovery
            const compPrevBalance = Math.round((currentBal - compTxns.credit + compTxns.recovery) * 100) / 100;
            const compClosing = Math.round((compPrevBalance + compTxns.credit - compTxns.recovery) * 100) / 100;

            companyBreakdown.push({
              companyId: cid,
              companyName: compNameMap[cid] || cid,
              previousBalance: compPrevBalance,
              todayCredit: Math.round(compTxns.credit * 100) / 100,
              todayRecovery: Math.round(compTxns.recovery * 100) / 100,
              closingBalance: compClosing,
            });
          }
        } else {
          // No ShopCompanyBalance entries — check if transactions have companyId
          const txnCompanyIds = [...new Set(
            dayTxns.map((t: { companyId: string | null }) => t.companyId).filter(Boolean)
          )] as string[];

          if (txnCompanyIds.length > 0) {
            const compNameRes = await pool.query(
              `SELECT id, name FROM "Company" WHERE id = ANY($1::text[])`,
              [txnCompanyIds]
            );
            const compNameMap: Record<string, string> = {};
            for (const row of compNameRes.rows) {
              compNameMap[row.id] = row.name;
            }

            for (const cid of txnCompanyIds) {
              const compTxns = txnByCompany.get(cid) || { credit: 0, recovery: 0 };
              // Without ShopCompanyBalance, use transaction data to estimate
              companyBreakdown.push({
                companyId: cid,
                companyName: compNameMap[cid] || cid,
                previousBalance: 0, // Can't determine without ShopCompanyBalance
                todayCredit: Math.round(compTxns.credit * 100) / 100,
                todayRecovery: Math.round(compTxns.recovery * 100) / 100,
                closingBalance: 0,
              });
            }
          }
        }

        shopRecoveries.push({
          shopId: shop.id,
          shopName: shop.name,
          shopArea: shop.area,
          shopAddress: shop.address ?? null,
          companyId: shop.companyId,
          previousBalance: Math.round(prevBalance * 100) / 100,
          todayCredit: Math.round(todayCredit * 100) / 100,
          todayRecovery: Math.round(todayRecovery * 100) / 100,
          closingBalance: Math.round((prevBalance + todayCredit - todayRecovery) * 100) / 100,
          visited: recoveryTxns.length > 0 || hasPendingRecovery,
          companyBreakdown,
          recoveryEntries,
        });
      }

      const totalRecovery = shopRecoveries.reduce((s: number, shop: ShopRecovery) => s + shop.todayRecovery, 0);
      const visitedShops = shopRecoveries.filter((s: ShopRecovery) => s.visited).length;

      // Build companyBreakdown - aggregate recovery by company
      const companyMap = new Map<string, { companyId: string; companyName: string; totalRecovery: number; shops: Set<string> }>();

      // Get company names for all relevant company IDs
      const companyIds = [...new Set(shopRecoveries.map((s: ShopRecovery) => s.companyId).filter(Boolean))] as string[];
      let companyNames: Record<string, string> = {};

      if (companyIds.length > 0) {
        const compRes = await pool.query(
          `SELECT id, name FROM "Company" WHERE id = ANY($1::text[])`,
          [companyIds]
        );
        for (const row of compRes.rows) {
          companyNames[row.id] = row.name;
        }
      }

      for (const sr of shopRecoveries) {
        if (sr.companyId) {
          const existing = companyMap.get(sr.companyId);
          if (existing) {
            existing.totalRecovery += sr.todayRecovery;
            existing.shops.add(sr.shopId);
          } else {
            companyMap.set(sr.companyId, {
              companyId: sr.companyId,
              companyName: companyNames[sr.companyId] || sr.companyId,
              totalRecovery: sr.todayRecovery,
              shops: new Set([sr.shopId]),
            });
          }
        } else {
          // For shops without a specific companyId (primary shops),
          // derive company breakdown from their transactions
          // We already fetched transactions above; re-query for company grouping
        }
      }

      // For primary shops without companyId, get company breakdown from transactions
      const primaryShopIds = shopRecoveries
        .filter((s: ShopRecovery) => !s.companyId)
        .map((s: ShopRecovery) => s.shopId);

      if (primaryShopIds.length > 0) {
        let breakdownQuery = `SELECT "companyId", SUM(amount) as "totalRecovery", COUNT(DISTINCT "shopId") as shop_count
           FROM "Transaction"
           WHERE "shopId" = ANY($1::text[]) AND "createdAt" >= $2 AND "createdAt" <= $3 AND status = 'approved' AND type = 'recovery' AND "companyId" IS NOT NULL`;
        const breakdownParams: (string[] | string | Date)[] = [primaryShopIds, startDate.toISOString(), endDate.toISOString()];

        if (companyId) {
          breakdownQuery += ` AND "companyId" = $4`;
          breakdownParams.push(companyId);
        }

        breakdownQuery += ` GROUP BY "companyId"`;

        const breakdownRes = await pool.query(breakdownQuery, breakdownParams);

        for (const row of breakdownRes.rows) {
          const cid = row.companyId;
          const existing = companyMap.get(cid);
          if (existing) {
            existing.totalRecovery += parseFloat(row.totalRecovery) || 0;
            // We can't easily merge shop counts without knowing specific shop IDs from this aggregate
            // So we'll approximate by adding the count
          } else {
            companyMap.set(cid, {
              companyId: cid,
              companyName: companyNames[cid] || cid,
              totalRecovery: parseFloat(row.totalRecovery) || 0,
              shops: new Set(), // We don't have individual shop IDs from this aggregate
            });
          }
        }

        // Fetch company names for any new company IDs
        const allCompanyIds = Array.from(companyMap.keys());
        const missingCompanyIds = allCompanyIds.filter(id => !companyNames[id]);
        if (missingCompanyIds.length > 0) {
          const compRes = await pool.query(
            `SELECT id, name FROM "Company" WHERE id = ANY($1::text[])`,
            [missingCompanyIds]
          );
          for (const row of compRes.rows) {
            companyNames[row.id] = row.name;
            const entry = companyMap.get(row.id);
            if (entry) {
              entry.companyName = row.name;
            }
          }
        }
      }

      const companyBreakdown: CompanyBreakdown[] = Array.from(companyMap.values()).map(c => ({
        companyId: c.companyId,
        companyName: c.companyName,
        totalRecovery: Math.round(c.totalRecovery * 100) / 100,
        shops: c.shops.size,
      }));

      return {
        orderbookerId: ob.id,
        orderbookerName: ob.name,
        orderbookerPhone: ob.phone,
        totalRecovery: Math.round(totalRecovery * 100) / 100,
        totalShops: allShops.length,
        visitedShops,
        companyBreakdown,
        shops: shopRecoveries,
      };
    })
  );

  const grandTotalRecovery = recoverySummary.reduce((s: number, ob: { totalRecovery: number }) => s + ob.totalRecovery, 0);

  return {
    date: displayDate,
    grandTotalRecovery: Math.round(grandTotalRecovery * 100) / 100,
    orderbookers: recoverySummary,
  };
}
