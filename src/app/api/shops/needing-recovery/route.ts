import { NextRequest, NextResponse } from 'next/server';
import { getOverdueShops, OVERDUE_THRESHOLD_DAYS } from '@/lib/overdue';

// GET /api/shops/needing-recovery?minDays=14&orderbookerId=xxx&companyId=xxx
// Returns shops with outstanding balance, with FIFO aging breakdown.
//
// v2 (Aug 2026) — uses FIFO-based aging from src/lib/overdue.ts:
//   - daysOverdue = days since OLDEST unpaid credit (not latest)
//   - overdueAmount = sum of unpaid portions of credits 14+ days old
//   - unpaidBills = top 5 oldest unpaid bills (FIFO breakdown)
//
// The dashboard can sort/filter by daysOverdue to find shops needing
// urgent recovery.
//
// If companyId is provided, the displayed balance is the per-company
// balance from ShopCompanyBalance (unchanged from old behavior). The
// FIFO breakdown is still computed at shop-level — applied across all
// companies on that shop.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const minDays = parseInt(searchParams.get('minDays') || String(OVERDUE_THRESHOLD_DAYS));
    const orderbookerId = searchParams.get('orderbookerId');
    const companyId = searchParams.get('companyId');

    // Fetch all shops with outstanding balance (use FIFO lib, include non-overdue
    // so dashboard can show aging breakdown for all such shops, not just overdue)
    const fifoShops = await getOverdueShops({
      orderbookerId: orderbookerId || undefined,
      companyId: companyId || undefined,
      includeNonOverdue: true,        // we filter by minDays later
      minDays,
      limit: 1000,                   // dashboard can show all
    });

    // If companyId filter is set, we need per-company balance per shop
    // (FIFO is shop-level, but the dashboard's "balance" display should be
    // company-specific when filter is set)
    const { getPool } = await import('@/lib/pg');
    const pool = getPool();

    const shopIds = fifoShops.map((s) => s.shopId);
    let companyBalancesByShop: Record<string, Array<{ companyId: string; companyName: string; balance: number }>> = {};

    if (shopIds.length > 0) {
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

    // Build response
    const shops = fifoShops.map((s) => {
      const shopCompanies = companyBalancesByShop[s.shopId] || [];

      // Determine display balance — if companyId filter is set, use per-company;
      // otherwise use shop's total balance (Shop.balance — authoritative)
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
        id: s.shopId,
        name: s.shopName,
        area: s.shopArea,
        address: s.shopAddress,
        companyName: displayCompanyName,
        companyBalances: shopCompanies,         // array of all companies with outstanding
        balance: displayBalance,                // if companyId: that company's; else shop total
        phone: s.shopPhone,
        orderbookerId: s.orderbookerId,
        orderbookerName: s.orderbookerName,

        // ── New v2 FIFO fields ──
        totalBalance: s.totalBalance,            // shop's authoritative total (Shop.balance)
        overdueAmount: s.overdueAmount,          // sum of unpaid portions 14+ days old
        oldestUnpaidCreditDate: s.oldestUnpaidCreditDate,
        daysSinceCredit: s.daysOverdue,          // alias for backward compat — old field name
        daysOverdue: s.daysOverdue,               // new name
        unpaidBills: s.unpaidBills,              // top 5 oldest unpaid bills (FIFO breakdown)
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
