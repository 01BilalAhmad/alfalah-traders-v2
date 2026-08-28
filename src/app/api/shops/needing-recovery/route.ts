import { NextRequest, NextResponse } from 'next/server';
import { getOverdueShops, OVERDUE_THRESHOLD_DAYS } from '@/lib/overdue';

// GET /api/shops/needing-recovery?minDays=14&orderbookerId=xxx&companyId=xxx
// Returns shops whose OLDEST unpaid credit is 14+ days old (FIFO aging).
//
// v2 (Aug 2026) — uses FIFO-based aging from src/lib/overdue.ts:
//   - daysSinceCredit = days since OLDEST unpaid credit (not latest)
//   - overdueAmount = sum of unpaid portions of credits 14+ days old
//   - unpaidBills = top 5 oldest unpaid bills (FIFO breakdown)
//
// Behavior preserved from v1:
//   - Only shops where daysSinceCredit >= minDays are returned
//     (so admin "Overdue Shops" page never shows 1-2 day shops)
//   - companyId filter restricts to shops with outstanding for that company
//   - When companyId is set, the displayed balance is per-company
//   - lastCreditDate + lastRecoveryDate are included for the dashboard's
//     "Last Credit" column display (still uses MAX(createdAt) — the
//     latest transaction date, NOT FIFO oldest)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const minDays = parseInt(searchParams.get('minDays') || String(OVERDUE_THRESHOLD_DAYS));
    const orderbookerId = searchParams.get('orderbookerId');
    const companyId = searchParams.get('companyId');

    // Fetch shops that are actually overdue (FIFO oldest unpaid >= minDays)
    // includeNonOverdue = false (the default) — only return shops where
    // s.isOverdue === true (daysOverdue >= minDays && overdueAmount > 0).
    // This is CRITICAL — otherwise the admin dashboard would show shops
    // with 1-2 day aging labeled as "Overdue", which is wrong.
    const fifoShops = await getOverdueShops({
      orderbookerId: orderbookerId || undefined,
      companyId: companyId || undefined,
      includeNonOverdue: false,        // ← FIX: only actually-overdue shops
      minDays,
      limit: 1000,
    });

    // For the dashboard's "Last Credit" / "Last Recovery" columns, we also
    // fetch the LATEST transaction dates (MAX createdAt — NOT FIFO oldest).
    // These are display-only fields; FIFO logic uses oldest, not latest.
    const { getPool } = await import('@/lib/pg');
    const pool = getPool();

    const shopIds = fifoShops.map((s) => s.shopId);
    let legacyDates: Record<string, { lastCredit: string | null; lastRecovery: string | null; daysSinceCreditLegacy: number | null; daysSinceRecovery: number | null }> = {};
    let companyBalancesByShop: Record<string, Array<{ companyId: string; companyName: string; balance: number }>> = {};

    if (shopIds.length > 0) {
      // Latest transaction dates per shop (for display columns)
      const datesRes = await pool.query(
        `SELECT
           t."shopId",
           MAX(CASE WHEN t.type = 'credit' THEN t."createdAt" END) AS "lastCredit",
           MAX(CASE WHEN t.type = 'recovery' THEN t."createdAt" END) AS "lastRecovery"
         FROM "Transaction" t
         WHERE t."shopId" = ANY($1::text[]) AND t.status = 'approved'
         GROUP BY t."shopId"`,
        [shopIds]
      );

      const now = Date.now();
      for (const row of datesRes.rows) {
        const lastCredit = row.lastCredit ? new Date(row.lastCredit) : null;
        const lastRecovery = row.lastRecovery ? new Date(row.lastRecovery) : null;
        legacyDates[row.shopId] = {
          lastCredit: lastCredit ? lastCredit.toISOString() : null,
          lastRecovery: lastRecovery ? lastRecovery.toISOString() : null,
          daysSinceCreditLegacy: lastCredit
            ? Math.floor((now - lastCredit.getTime()) / (1000 * 60 * 60 * 24))
            : null,
          daysSinceRecovery: lastRecovery
            ? Math.floor((now - lastRecovery.getTime()) / (1000 * 60 * 60 * 24))
            : null,
        };
      }

      // Per-company balance breakdown (for companyId filter display)
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

    // Build response — preserve v1 field names + add v2 FIFO fields
    const shops = fifoShops.map((s) => {
      const legacy = legacyDates[s.shopId] || {
        lastCredit: null, lastRecovery: null,
        daysSinceCreditLegacy: null, daysSinceRecovery: null,
      };
      const shopCompanies = companyBalancesByShop[s.shopId] || [];

      // Display balance: per-company when companyId filter set, else shop total
      let displayBalance = s.totalBalance;
      let displayCompanyName: string | null = s.companyName;

      if (companyId) {
        const match = shopCompanies.find((c) => c.companyId === companyId);
        if (match) {
          displayBalance = match.balance;
          displayCompanyName = match.companyName;
        }
      }

      return {
        // ── v1 fields (preserved for backward compat with dashboard UI) ──
        id: s.shopId,
        name: s.shopName,
        area: s.shopArea,
        address: s.shopAddress,
        companyName: displayCompanyName,
        companyBalances: shopCompanies,
        balance: displayBalance,
        phone: s.shopPhone,
        orderbookerId: s.orderbookerId,
        orderbookerName: s.orderbookerName,

        // Latest transaction dates (for "Last Credit" / "Last Recovery" columns)
        lastCreditDate: legacy.lastCredit,
        lastRecoveryDate: legacy.lastRecovery,

        // IMPORTANT: daysSinceCredit uses FIFO oldest unpaid credit's date.
        // This is what the "DaysBadge" should display — the days the shop
        // has been overdue, NOT days since latest credit. With FIFO this is
        // the actual age of the oldest unpaid bill — which is the
        // accounting-correct value to show.
        daysSinceCredit: s.daysOverdue,
        daysSinceRecovery: legacy.daysSinceRecovery,

        // ── v2 FIFO fields (new — for future UI upgrades) ──
        totalBalance: s.totalBalance,            // Shop.balance (authoritative)
        overdueAmount: s.overdueAmount,          // sum of unpaid portions 14+ days old
        oldestUnpaidCreditDate: s.oldestUnpaidCreditDate,
        daysOverdue: s.daysOverdue,                // alias of daysSinceCredit
        unpaidBills: s.unpaidBills,                // top 5 oldest unpaid bills
        fifoMatchesShopBalance: s.fifoMatchesShopBalance,
      };
    });

    return NextResponse.json({
      minDays,
      count: shops.length,
      shops,
      // v2 indicator — dashboard can check this to enable new UI features
      v2: true,
    });
  } catch (error) {
    console.error('Error fetching shops needing recovery:', error);
    return NextResponse.json({ error: 'Failed to fetch shops needing recovery' }, { status: 500 });
  }
}
