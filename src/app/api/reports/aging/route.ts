import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { getOverdueShops, OVERDUE_THRESHOLD_DAYS } from '@/lib/overdue';

const OVERDUE_MS = OVERDUE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

// 14+ day overdue portion, computed from the FULL unpaid bill list.
// (getOverdueShops' SQL overdueAmount uses the minDays threshold — which is 0
// in the aging default mode for full bucket coverage — so the 14+ portion is
// recomputed here from bill dates.)
function overdue14Portion(bills: any[]): number {
  if (!Array.isArray(bills)) return 0;
  const now = Date.now();
  return bills.reduce((sum, b) => {
    const t = b?.date ? new Date(b.date).getTime() : NaN;
    if (Number.isNaN(t)) return sum;
    return sum + (now - t >= OVERDUE_MS ? Number(b.remaining || 0) : 0);
  }, 0);
}

// GET /api/reports/aging
// Aging Report — outstanding balance by age buckets (0-30, 31-60, 61-90, 90+ days)
//
// ── v2 (Sep 2026) — FIFO-BASED AGING ─────────────────────────────────────────
// v1 computed "age" as days since the LAST RECOVERY (falling back to last
// credit). That produced confusing "0 day" entries: a shop that recovered
// yesterday but still had outstanding balance showed "Age 0d / 0-30 Days"
// even when its unpaid bills were months old. Age now = days since the
// shop's OLDEST UNPAID credit bill (FIFO — same logic as the Overdue Shops
// page, see src/lib/overdue.ts).
//
// Per-shop extras now included:
//   - oldestUnpaidCreditDate  (ISO) — date of the oldest unpaid bill
//   - overdueAmount           — unpaid portion of bills 14+ days old
//   - unpaidBills             — top 5 oldest unpaid bills
//       { date, amount, remaining, daysOld }  → amount detail WITH DATE
//   - unpaidBillCount         — total number of unpaid bills
//   - fifoMatchesShopBalance  — false → balance includes claims/adjustments
//
// Shops with balance > 0 but NO unpaid bills (balance from claims etc.) get
// bucket 'review' — shown separately instead of a misleading "0 day" age.
//
// Query params:
//   - orderbookerId: filter by OB (optional)
//   - companyId: filter by company (optional) — per-company FIFO + balance
//   - search: shop name search (optional)

// ─── Helpers ────────────────────────────────────────────────────────────────

// Normalize a DB date (Date object or naive ISO string) to a Z-suffixed ISO
// string so browsers in PKT display the correct calendar date.
function toIso(v: unknown): string | null {
  if (!v) return null;
  try {
    return new Date(v as any).toISOString();
  } catch {
    return null;
  }
}

function daysBetweenNow(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

interface BillRow {
  date: string | null;
  amount: number;
  remaining: number;
  daysOld: number | null;
}

function mapBills(raw: any[] | null | undefined, limit = 5): BillRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b) => Number(b?.remaining ?? 0) > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, limit)
    .map((b) => {
      const date = toIso(b.date);
      return {
        date,
        amount: Number(b.amount || 0),
        remaining: Number(b.remaining || 0),
        daysOld: daysBetweenNow(date),
      };
    });
}

function bucketFor(ageDays: number | null): string {
  if (ageDays === null) return 'review';
  if (ageDays <= 30) return '0-30';
  if (ageDays <= 60) return '31-60';
  if (ageDays <= 90) return '61-90';
  return '90+';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const companyId = searchParams.get('companyId');
    const searchQuery = searchParams.get('search');

    const pool = getPool();

    // ── Shared shape builders ──
    const summary = {
      total: 0,
      bucket0_30: 0,
      bucket31_60: 0,
      bucket61_90: 0,
      bucket90plus: 0,
      shopCount: 0,
      // v2 extras
      overdueAmount: 0,
      needsReviewCount: 0,
      needsReviewAmount: 0,
    };

    const addShopToSummary = (balance: number, ageDays: number | null, overdueAmount: number) => {
      const bucket = bucketFor(ageDays);
      if (bucket === '0-30') summary.bucket0_30 += balance;
      else if (bucket === '31-60') summary.bucket31_60 += balance;
      else if (bucket === '61-90') summary.bucket61_90 += balance;
      else if (bucket === '90+') summary.bucket90plus += balance;
      else {
        summary.needsReviewCount += 1;
        summary.needsReviewAmount += balance;
      }
      summary.overdueAmount += overdueAmount;
      summary.total += balance;
      summary.shopCount += 1;
    };

    // ══════════════════════════════════════════════════════════════════════
    // COMPANY MODE — per-company FIFO (transactions filtered by companyId)
    // ══════════════════════════════════════════════════════════════════════
    if (companyId) {
      const conditions: string[] = [`scb."companyId" = $1`, `scb.balance > 0`, `s.status = 'active'`];
      const params: unknown[] = [companyId];
      let paramIdx = 2;

      // Same OB/search conditions apply inside the CTE shop filter so the
      // FIFO math covers exactly the shops being listed.
      const innerConditions: string[] = [`scb."companyId" = $1`, `scb.balance > 0`, `s.status = 'active'`];

      if (orderbookerId) {
        conditions.push(`s."orderbookerId" = $${paramIdx}`);
        innerConditions.push(`s."orderbookerId" = $${paramIdx++}`);
        params.push(orderbookerId);
      }
      if (searchQuery) {
        conditions.push(`s.name ILIKE $${paramIdx}`);
        innerConditions.push(`s.name ILIKE $${paramIdx++}`);
        params.push(`%${searchQuery}%`);
      }

      const res = await pool.query(
        `WITH shop_filter AS (
           SELECT scb."shopId"
           FROM "ShopCompanyBalance" scb
           INNER JOIN "Shop" s ON s.id = scb."shopId"
           WHERE ${innerConditions.join(' AND ')}
         ),
         credits AS (
           SELECT
             "shopId", id, "createdAt", amount,
             SUM(amount) OVER (PARTITION BY "shopId" ORDER BY "createdAt", id) AS cum_credit
           FROM "Transaction"
           WHERE type = 'credit' AND status = 'approved' AND "companyId" = $1
             AND "shopId" IN (SELECT "shopId" FROM shop_filter)
         ),
         total_recoveries AS (
           SELECT "shopId", COALESCE(SUM(amount), 0) AS val
           FROM "Transaction"
           WHERE type = 'recovery' AND status = 'approved' AND "companyId" = $1
             AND "shopId" IN (SELECT "shopId" FROM credits)
           GROUP BY "shopId"
         ),
         unpaid_credits AS (
           SELECT
             c."shopId", c.id, c."createdAt", c.amount, c.cum_credit,
             CASE
               WHEN c.cum_credit <= COALESCE(tr.val, 0) THEN 0
               WHEN (c.cum_credit - c.amount) >= COALESCE(tr.val, 0) THEN c.amount
               ELSE c.cum_credit - COALESCE(tr.val, 0)
             END AS remaining
           FROM credits c
           LEFT JOIN total_recoveries tr ON c."shopId" = tr."shopId"
         ),
         agg AS (
           SELECT
             uc."shopId",
             COALESCE(SUM(uc.remaining), 0) AS "fifoTotal",
             MIN(uc."createdAt") FILTER (WHERE uc.remaining > 0) AS "oldestUnpaid",
             COALESCE(
               SUM(uc.remaining) FILTER (
                 WHERE uc."createdAt" < NOW() - INTERVAL '${OVERDUE_THRESHOLD_DAYS} days'
               ), 0
             ) AS "overdueAmount",
             COUNT(*) FILTER (WHERE uc.remaining > 0) AS "unpaidBillCount"
           FROM unpaid_credits uc
           GROUP BY uc."shopId"
         ),
         bills AS (
           SELECT
             uc."shopId",
             json_agg(
               json_build_object(
                 'date', uc."createdAt",
                 'amount', uc.amount,
                 'remaining', uc.remaining
               ) ORDER BY uc."createdAt"
             ) AS "unpaidBills"
           FROM unpaid_credits uc
           WHERE uc.remaining > 0
           GROUP BY uc."shopId"
         )
         SELECT
           scb."shopId", s.name AS "shopName", s.area, s.address,
           u.name AS "orderbookerName",
           scb.balance AS "balance",
           c.name AS "companyName",
           agg."fifoTotal", agg."oldestUnpaid", agg."overdueAmount",
           agg."unpaidBillCount", bills."unpaidBills",
           (SELECT t."createdAt" FROM "Transaction" t
            WHERE t."shopId" = scb."shopId" AND t.type = 'credit' AND t.status = 'approved'
              AND t."companyId" = $1
            ORDER BY t."createdAt" DESC LIMIT 1) AS "lastCreditDate",
           (SELECT t."createdAt" FROM "Transaction" t
            WHERE t."shopId" = scb."shopId" AND t.type = 'recovery' AND t.status = 'approved'
              AND t."companyId" = $1
            ORDER BY t."createdAt" DESC LIMIT 1) AS "lastRecoveryDate",
           (SELECT json_agg(json_build_object(
              'companyName', c2.name,
              'balance', scb2.balance,
              'companyId', scb2."companyId"
            ))
            FROM "ShopCompanyBalance" scb2
            LEFT JOIN "Company" c2 ON scb2."companyId" = c2.id
            WHERE scb2."shopId" = scb."shopId" AND scb2.balance > 0) AS "companyBalances"
         FROM "ShopCompanyBalance" scb
         INNER JOIN "Shop" s ON s.id = scb."shopId"
         INNER JOIN "Company" c ON c.id = scb."companyId"
         LEFT JOIN "User" u ON s."orderbookerId" = u.id
         LEFT JOIN agg ON agg."shopId" = scb."shopId"
         LEFT JOIN bills ON bills."shopId" = scb."shopId"
         WHERE ${conditions.join(' AND ')}
         ORDER BY scb.balance DESC`,
        params
      );

      const shops: any[] = [];
      for (const row of res.rows) {
        const balance = Number(row.balance);
        if (balance <= 0) continue;

        const fifoTotal = Number(row.fifoTotal || 0);
        const hasUnpaid = fifoTotal > 0 || Number(row.unpaidBillCount || 0) > 0;
        const oldestIso = toIso(row.oldestUnpaid);
        const ageDays = hasUnpaid ? daysBetweenNow(oldestIso) : null;
        const overdueAmount = Number(row.overdueAmount || 0);
        const unpaidBills = mapBills(row.unpaidBills);

        addShopToSummary(balance, ageDays, hasUnpaid ? overdueAmount : 0);

        shops.push({
          shopId: row.shopId,
          shopName: row.shopName,
          area: row.area || 'Unknown',
          address: row.address || null,
          orderbookerName: row.orderbookerName || 'Unassigned',
          balance: round2(balance),
          ageDays,
          bucket: bucketFor(ageDays),
          oldestUnpaidCreditDate: oldestIso,
          overdueAmount: round2(hasUnpaid ? overdueAmount : 0),
          unpaidBills,
          unpaidBillCount: Number(row.unpaidBillCount || 0),
          fifoTotalBalance: round2(fifoTotal),
          fifoMatchesShopBalance: hasUnpaid ? Math.abs(fifoTotal - balance) <= 1 : false,
          companyName: row.companyName,
          companyBalances: row.companyBalances || [],
          lastCreditDate: toIso(row.lastCreditDate),
          lastRecoveryDate: toIso(row.lastRecoveryDate),
        });
      }

      shops.sort((a, b) => {
        if (a.bucket === 'review' && b.bucket !== 'review') return -1;
        if (b.bucket === 'review' && a.bucket !== 'review') return 1;
        return (b.ageDays ?? -1) - (a.ageDays ?? -1);
      });

      for (const k of ['total', 'bucket0_30', 'bucket31_60', 'bucket61_90', 'bucket90plus', 'overdueAmount', 'needsReviewAmount'] as const) {
        summary[k] = round2(summary[k]);
      }

      return NextResponse.json({ summary, shops, mode: 'company' });
    }

    // ══════════════════════════════════════════════════════════════════════
    // DEFAULT MODE — total shop balance, FIFO aging (reuses src/lib/overdue.ts)
    // ══════════════════════════════════════════════════════════════════════

    // 1. FIFO breakdown for every shop with unpaid credits (any age).
    const fifoShops = await getOverdueShops({
      orderbookerId: orderbookerId || undefined,
      includeNonOverdue: true, // aging covers ALL outstanding, not just overdue
      minDays: 0, // no threshold — bucket 0-30 must include young bills
      limit: 2000,
    });

    // Optional client-side search on FIFO shops (needsReview query applies it in SQL).
    const searchLower = searchQuery?.trim().toLowerCase();
    const fifoMatched = searchLower
      ? fifoShops.filter((s) => s.shopName.toLowerCase().includes(searchLower))
      : fifoShops;

    const fifoIds = fifoShops.map((s) => s.shopId);

    // 2. Shops with balance > 0 but NO unpaid bills (claims/adjustments) → review.
    const reviewParams: unknown[] = [fifoIds];
    let reviewIdx = 2;
    let reviewWhere = `s.status = 'active' AND s.balance > 0 AND NOT (s.id = ANY($1::text[]))`;
    if (orderbookerId) {
      reviewWhere += ` AND s."orderbookerId" = $${reviewIdx++}`;
      reviewParams.push(orderbookerId);
    }
    if (searchLower) {
      reviewWhere += ` AND s.name ILIKE $${reviewIdx++}`;
      reviewParams.push(`%${searchQuery?.trim()}%`);
    }
    const reviewRes = await pool.query(
      `SELECT s.id AS "shopId", s.name AS "shopName", s.area, s.address,
              s.balance, u.name AS "orderbookerName"
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       WHERE ${reviewWhere}
       ORDER BY s.balance DESC`,
      reviewParams
    );

    // 3. Latest transaction dates + company balances for display columns.
    const allIds = [...fifoIds, ...reviewRes.rows.map((r: any) => r.shopId)];
    let legacyDates: Record<string, { lastCredit: string | null; lastRecovery: string | null }> = {};
    let companyBalancesByShop: Record<string, Array<{ companyName: string; balance: number; companyId: string }>> = {};

    if (allIds.length > 0) {
      const datesRes = await pool.query(
        `SELECT
           t."shopId",
           MAX(CASE WHEN t.type = 'credit' THEN t."createdAt" END) AS "lastCredit",
           MAX(CASE WHEN t.type = 'recovery' THEN t."createdAt" END) AS "lastRecovery"
         FROM "Transaction" t
         WHERE t."shopId" = ANY($1::text[]) AND t.status = 'approved'
         GROUP BY t."shopId"`,
        [allIds]
      );
      for (const row of datesRes.rows) {
        legacyDates[row.shopId] = {
          lastCredit: toIso(row.lastCredit),
          lastRecovery: toIso(row.lastRecovery),
        };
      }

      const scbRes = await pool.query(
        `SELECT scb."shopId", scb."companyId", scb.balance, c.name AS "companyName"
         FROM "ShopCompanyBalance" scb
         JOIN "Company" c ON c.id = scb."companyId"
         WHERE scb."shopId" = ANY($1::text[]) AND scb.balance > 0
         ORDER BY scb.balance DESC`,
        [allIds]
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

    // 4. Build response — FIFO shops first, then review shops.
    const shops: any[] = [];

    for (const s of fifoMatched) {
      const legacy = legacyDates[s.shopId] || { lastCredit: null, lastRecovery: null };
      const ageDays = s.daysOverdue;
      const allBills: any[] = s.unpaidBills || [];
      const overdueAmount = overdue14Portion(allBills);
      addShopToSummary(s.totalBalance, ageDays, overdueAmount);

      shops.push({
        shopId: s.shopId,
        shopName: s.shopName,
        area: s.shopArea || 'Unknown',
        address: s.shopAddress || null,
        orderbookerName: s.orderbookerName || 'Unassigned',
        balance: round2(s.totalBalance),
        ageDays,
        bucket: bucketFor(ageDays),
        oldestUnpaidCreditDate: s.oldestUnpaidCreditDate,
        overdueAmount: round2(overdueAmount),
        unpaidBills: mapBills(allBills),
        unpaidBillCount: allBills.length,
        fifoTotalBalance: round2(s.fifoTotalBalance),
        fifoMatchesShopBalance: s.fifoMatchesShopBalance,
        companyBalances: companyBalancesByShop[s.shopId] || [],
        lastCreditDate: legacy.lastCredit,
        lastRecoveryDate: legacy.lastRecovery,
      });
    }

    for (const row of reviewRes.rows) {
      const balance = Number(row.balance);
      if (balance <= 0) continue;
      addShopToSummary(balance, null, 0);

      shops.push({
        shopId: row.shopId,
        shopName: row.shopName,
        area: row.area || 'Unknown',
        address: row.address || null,
        orderbookerName: row.orderbookerName || 'Unassigned',
        balance: round2(balance),
        ageDays: null,
        bucket: 'review',
        oldestUnpaidCreditDate: null,
        overdueAmount: 0,
        unpaidBills: [],
        unpaidBillCount: 0,
        fifoTotalBalance: 0,
        fifoMatchesShopBalance: false,
        companyBalances: companyBalancesByShop[row.shopId] || [],
        lastCreditDate: legacyDates[row.shopId]?.lastCredit ?? null,
        lastRecoveryDate: legacyDates[row.shopId]?.lastRecovery ?? null,
      });
    }

    shops.sort((a, b) => {
      if (a.bucket === 'review' && b.bucket !== 'review') return -1;
      if (b.bucket === 'review' && a.bucket !== 'review') return 1;
      return (b.ageDays ?? -1) - (a.ageDays ?? -1);
    });

    for (const k of ['total', 'bucket0_30', 'bucket31_60', 'bucket61_90', 'bucket90plus', 'overdueAmount', 'needsReviewAmount'] as const) {
      summary[k] = round2(summary[k]);
    }

    return NextResponse.json({ summary, shops, mode: 'total' });
  } catch (error) {
    console.error('[Aging Report] Error:', error);
    return NextResponse.json({ error: 'Failed to generate aging report' }, { status: 500 });
  }
}
