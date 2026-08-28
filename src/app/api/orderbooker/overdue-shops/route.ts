import { NextRequest, NextResponse } from 'next/server';
import { getOverdueShops, OVERDUE_THRESHOLD_DAYS } from '@/lib/overdue';

// GET /api/orderbooker/overdue-shops?orderbookerId=xxx
// Returns list of overdue shops for an orderbooker's mobile app.
//
// v2 (Aug 2026) — uses FIFO-based aging from src/lib/overdue.ts:
//   - daysOverdue = days since OLDEST unpaid credit (not latest)
//   - overdueAmount = sum of unpaid portions of credits 14+ days old
//   - totalBalance = Shop.balance (what OB tells shopkeeper)
//   - unpaidBills = top 5 oldest unpaid bills (FIFO breakdown)
//
// Legacy fields (lastRecoveryDate, lastCreditDate) are kept for backward
// compat with the existing mobile app build — these still use the
// "latest transaction date" semantics. The mobile app should migrate to
// reading totalBalance / overdueAmount / daysOverdue / unpaidBills for
// the new 3-tier display.
//
// NO BREAKING CHANGES — old fields stay, new fields added alongside.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');

    if (!orderbookerId) {
      return NextResponse.json({ error: 'orderbookerId is required' }, { status: 400 });
    }

    // Fetch overdue shops using FIFO helper
    const fifoShops = await getOverdueShops({
      orderbookerId,
      includeNonOverdue: false,
      minDays: OVERDUE_THRESHOLD_DAYS,
      limit: 500,
    });

    // Also fetch the latest credit/recovery dates for backward compat
    // (mobile app's existing UI uses these fields)
    const { getPool } = await import('@/lib/pg');
    const pool = getPool();

    const shopIds = fifoShops.map((s) => s.shopId);
    let legacyDates: Record<string, { lastCredit: string | null; lastRecovery: string | null }> = {};
    if (shopIds.length > 0) {
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
      for (const row of datesRes.rows) {
        legacyDates[row.shopId] = {
          lastCredit: row.lastCredit ? new Date(row.lastCredit).toISOString() : null,
          lastRecovery: row.lastRecovery ? new Date(row.lastRecovery).toISOString() : null,
        };
      }
    }

    // Build response — old fields + new FIFO fields
    const overdueShops = fifoShops.map((s) => {
      const legacy = legacyDates[s.shopId] || { lastCredit: null, lastRecovery: null };
      return {
        // ── Old fields (kept for mobile app backward compat) ──
        shopId: s.shopId,
        shopName: s.shopName,
        shopArea: s.shopArea,
        shopAddress: s.shopAddress,
        balance: s.totalBalance,                              // mobile app's existing "balance" field
        lastRecoveryDate: legacy.lastRecovery,
        lastCreditDate: legacy.lastCredit,
        daysOverdue: s.daysOverdue,

        // ── New v2 FIFO fields (mobile app should migrate to these) ──
        totalBalance: s.totalBalance,                          // = Shop.balance (authoritative)
        overdueAmount: s.overdueAmount,                       // sum of unpaid portions 14+ days old
        oldestUnpaidCreditDate: s.oldestUnpaidCreditDate,
        unpaidBills: s.unpaidBills,                           // top 5 oldest unpaid bills (FIFO)
        companyName: s.companyName,
        // Sanity flag — if false, FIFO computation diverged from Shop.balance.
        // Mobile app should display "needs review" warning for these.
        fifoMatchesShopBalance: s.fifoMatchesShopBalance,
      };
    });

    // Sort: most overdue first
    overdueShops.sort((a, b) => b.daysOverdue - a.daysOverdue);

    return NextResponse.json({
      overdueShops,
      count: overdueShops.length,
      threshold: OVERDUE_THRESHOLD_DAYS,
      // v2 indicator — mobile app can check this to enable new UI
      v2: true,
    });
  } catch (error) {
    console.error('[Overdue Shops API] Error:', error);
    // Return empty array instead of 500 — app should never break
    return NextResponse.json({
      overdueShops: [],
      count: 0,
      threshold: OVERDUE_THRESHOLD_DAYS,
      v2: true,
    });
  }
}
