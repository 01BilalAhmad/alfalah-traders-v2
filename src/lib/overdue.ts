/**
 * Overdue Detection Library — FIFO Aging Approach
 * =================================================
 *
 * WHY THIS EXISTS
 * ---------------
 * The old overdue logic looked only at the LATEST credit & recovery dates
 * (MAX("createdAt")). This had a bug: when a shopkeeper made a fresh small
 * bill, the "last credit" clock reset and the shop was no longer flagged
 * overdue — even if an OLDER bill was still unpaid.
 *
 * THE FIX — FIFO (First-In-First-Out) accounting
 * ----------------------------------------------
 * Every recovery is applied against the OLDEST outstanding credit first.
 * A shop is overdue if ANY unpaid credit is 14+ days old.
 *
 * Per-bill remaining is computed like this:
 *   cum_credit = cumulative sum of credits up to & incl this row (per shop)
 *   total_recovery = total approved recoveries for the shop
 *
 *   if cum_credit <= total_recovery          → fully paid (remaining = 0)
 *   if (cum_credit - amount) >= total       → fully unpaid (remaining = amount)
 *   otherwise                                → partially paid (remaining = cum_credit - total)
 *
 * EDGE-CASE SAFETY
 * -----------------
 * `Shop.balance` is the authoritative running total (updated on every
 * transaction including claims). If FIFO total doesn't match
 * `Shop.balance` (e.g. due to "claim" adjustments), the caller should
 * fall back to using `Shop.balance` as the displayed total, and treat
 * FIFO breakdown as supplementary info only.
 *
 * NO SCHEMA CHANGE — uses only existing Transaction table.
 *
 * PERFORMANCE
 * -----------
 * Uses window functions + per-shop partitioning. Transaction table has
 * indexes on (shopId), (type), (status), (createdAt) — sufficient for
 * ~200 shops in the daily cron.
 */

import { getPool } from '@/lib/pg';

// ─── Constants ────────────────────────────────────────────────────────────

export const OVERDUE_THRESHOLD_DAYS = 14;

// ─── Types ────────────────────────────────────────────────────────────────

export interface UnpaidBill {
  date: string;          // ISO string of credit transaction's createdAt
  amount: number;        // original credit amount
  remaining: number;     // unpaid portion after FIFO
  daysOld: number;       // days since credit transaction date
  companyId: string | null;
}

export interface OverdueShopInfo {
  shopId: string;
  shopName: string;
  shopArea: string | null;
  shopAddress: string | null;
  shopPhone: string | null;
  orderbookerId: string | null;
  orderbookerName: string | null;

  // Display values — totalBalance is authoritative (matches Shop.balance,
  // what orderbooker tells shopkeeper). fifoTotalBalance is for sanity check.
  totalBalance: number;
  fifoTotalBalance: number;

  // Aging info (from FIFO)
  oldestUnpaidCreditDate: string | null;
  daysOverdue: number;
  overdueAmount: number;     // sum of unpaid portions of credits 14+ days old
  isOverdue: boolean;

  // Per-bill breakdown — top 5 oldest unpaid bills (for SMS detail section)
  unpaidBills: UnpaidBill[];

  // Sanity flag — false when FIFO total differs from Shop.balance by >1 rupee
  // Callers should NOT display overdueAmount as authoritative when false
  // (fall back to just showing totalBalance + oldestUnpaidCreditDate)
  fifoMatchesShopBalance: boolean;

  // Company name (for SMS — primary company with outstanding balance)
  companyName: string | null;
}

// ─── Internal row mapper ─────────────────────────────────────────────────

interface RawRow {
  shopId: string;
  shopName: string;
  shopArea: string | null;
  shopAddress: string | null;
  totalBalance: string | number;
  shopPhone: string | null;
  orderbookerId: string | null;
  orderbookerName: string | null;
  fifoTotalBalance: string | number;
  oldestUnpaidCreditDate: Date | null;
  overdueAmount: string | number;
  daysOverdueDb: string | number | null;
  unpaidBillsJson: any[] | null;
  companyName: string | null;
}

function mapRow(row: RawRow, minDays: number): OverdueShopInfo {
  const totalBalance = Number(row.totalBalance || 0);
  const fifoTotal = Number(row.fifoTotalBalance || 0);
  const overdueAmount = Number(row.overdueAmount || 0);
  const oldestDate = row.oldestUnpaidCreditDate
    ? new Date(row.oldestUnpaidCreditDate)
    : null;
  const daysOverdue = oldestDate
    ? Math.floor((Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const unpaidBills: UnpaidBill[] = Array.isArray(row.unpaidBillsJson)
    ? (row.unpaidBillsJson as any[]).map((b) => ({
        date: b.date,
        amount: Number(b.amount || 0),
        remaining: Number(b.remaining || 0),
        daysOld: Number(b.daysOld || 0),
        companyId: b.companyId || null,
      }))
    : [];

  const fifoMatches = Math.abs(fifoTotal - totalBalance) <= 1;

  return {
    shopId: row.shopId,
    shopName: row.shopName,
    shopArea: row.shopArea || null,
    shopAddress: row.shopAddress || null,
    shopPhone: row.shopPhone || null,
    orderbookerId: row.orderbookerId || null,
    orderbookerName: row.orderbookerName || null,
    totalBalance,
    fifoTotalBalance: fifoTotal,
    oldestUnpaidCreditDate: oldestDate ? oldestDate.toISOString() : null,
    daysOverdue,
    overdueAmount,
    isOverdue: daysOverdue >= minDays && overdueAmount > 0,
    unpaidBills,
    fifoMatchesShopBalance: fifoMatches,
    companyName: row.companyName || null,
  };
}

// ─── Main entry — get all shops with outstanding balance ──────────────────

/**
 * Get all shops with outstanding balance (and optionally only overdue ones).
 *
 * @param opts.orderbookerId — optional filter (mobile app uses per-OB view)
 * @param opts.companyId — optional filter (admin dashboard company filter)
 * @param opts.includeNonOverdue — if false (default), only returns shops
 *                                  where daysOverdue >= minDays
 * @param opts.minDays — overdue threshold (default 14)
 * @param opts.limit — cap on shops returned (default 200)
 */
export async function getOverdueShops(opts: {
  orderbookerId?: string;
  companyId?: string;
  includeNonOverdue?: boolean;
  minDays?: number;
  limit?: number;
} = {}): Promise<OverdueShopInfo[]> {
  const minDays = opts.minDays ?? OVERDUE_THRESHOLD_DAYS;
  const limit = opts.limit ?? 200;
  const pool = getPool();

  // Build parameterized shop filter for the inner subquery
  const shopFilterClauses: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (opts.orderbookerId) {
    shopFilterClauses.push(`"orderbookerId" = $${paramIdx++}`);
    params.push(opts.orderbookerId);
  }

  if (opts.companyId) {
    shopFilterClauses.push(`EXISTS (
      SELECT 1 FROM "ShopCompanyBalance" scb
      WHERE scb."shopId" = "Shop".id AND scb."companyId" = $${paramIdx++} AND scb.balance > 0
    )`);
    params.push(opts.companyId);
  }

  const shopFilterWhere = shopFilterClauses.length > 0
    ? `AND ${shopFilterClauses.join(' AND ')}`
    : '';

  // Final query — FIFO CTE then per-shop aggregation
  const query = `
WITH credits AS (
  SELECT
    "shopId", id, "createdAt", amount, "companyId",
    SUM(amount) OVER (PARTITION BY "shopId" ORDER BY "createdAt", id) AS cum_credit
  FROM "Transaction"
  WHERE type = 'credit' AND status = 'approved'
    AND "shopId" IN (
      SELECT id FROM "Shop"
      WHERE status = 'active' AND balance > 0 ${shopFilterWhere}
    )
),
total_recoveries AS (
  SELECT "shopId", COALESCE(SUM(amount), 0) AS val
  FROM "Transaction"
  WHERE type = 'recovery' AND status = 'approved'
    AND "shopId" IN (SELECT "shopId" FROM credits)
  GROUP BY "shopId"
),
unpaid_credits AS (
  SELECT
    c."shopId", c.id, c."createdAt", c.amount, c."companyId", c.cum_credit,
    CASE
      WHEN c.cum_credit <= COALESCE(tr.val, 0) THEN 0
      WHEN (c.cum_credit - c.amount) >= COALESCE(tr.val, 0) THEN c.amount
      ELSE c.cum_credit - COALESCE(tr.val, 0)
    END AS remaining
  FROM credits c
  LEFT JOIN total_recoveries tr ON c."shopId" = tr."shopId"
)
SELECT
  s.id AS "shopId",
  s.name AS "shopName",
  s.area AS "shopArea",
  s.address AS "shopAddress",
  s.balance AS "totalBalance",
  s.phone AS "shopPhone",
  s."orderbookerId",
  u.name AS "orderbookerName",
  COALESCE(SUM(uc.remaining), 0) AS "fifoTotalBalance",
  MIN(uc."createdAt") FILTER (WHERE uc.remaining > 0) AS "oldestUnpaidCreditDate",
  COALESCE(
    SUM(uc.remaining) FILTER (WHERE uc."createdAt" < NOW() - INTERVAL '${minDays} days'),
    0
  ) AS "overdueAmount",
  EXTRACT(DAY FROM NOW() - MIN(uc."createdAt") FILTER (WHERE uc.remaining > 0))::int AS "daysOverdueDb",
  (
    SELECT json_agg(
      json_build_object(
        'date', uc2."createdAt",
        'amount', uc2.amount,
        'remaining', uc2.remaining,
        'daysOld', EXTRACT(DAY FROM NOW() - uc2."createdAt")::int,
        'companyId', uc2."companyId"
      ) ORDER BY uc2."createdAt"
    )
    FROM unpaid_credits uc2
    WHERE uc2."shopId" = s.id AND uc2.remaining > 0
    LIMIT 5
  ) AS "unpaidBillsJson",
  (
    SELECT string_agg(DISTINCT c.name, ', ')
    FROM "ShopCompanyBalance" scb
    JOIN "Company" c ON c.id = scb."companyId"
    WHERE scb."shopId" = s.id AND scb.balance > 0
    LIMIT 1
  ) AS "companyName"
FROM "Shop" s
LEFT JOIN unpaid_credits uc ON s.id = uc."shopId"
LEFT JOIN "User" u ON s."orderbookerId" = u.id
WHERE s.status = 'active' AND s.balance > 0
GROUP BY s.id, s.name, s.area, s.address, s.balance, s.phone, s."orderbookerId", u.name
HAVING COALESCE(SUM(uc.remaining), 0) > 0
ORDER BY "daysOverdueDb" DESC NULLS LAST, "totalBalance" DESC
LIMIT ${limit}
  `.trim();

  const res = await pool.query(query, params);

  let shops = res.rows.map((r: any) => mapRow(r as RawRow, minDays));

  // Filter to only overdue shops if requested
  if (!opts.includeNonOverdue) {
    shops = shops.filter((s) => s.isOverdue);
  }

  return shops;
}

// ─── Single-shop variant (for testing/debug) ─────────────────────────────

/**
 * Get FIFO overdue info for a single shop. Returns null if shop has no
 * outstanding balance.
 */
export async function getOverdueInfoForShop(shopId: string): Promise<OverdueShopInfo | null> {
  const pool = getPool();

  const query = `
WITH credits AS (
  SELECT
    "shopId", id, "createdAt", amount, "companyId",
    SUM(amount) OVER (PARTITION BY "shopId" ORDER BY "createdAt", id) AS cum_credit
  FROM "Transaction"
  WHERE type = 'credit' AND status = 'approved' AND "shopId" = $1
),
total_recoveries AS (
  SELECT "shopId", COALESCE(SUM(amount), 0) AS val
  FROM "Transaction"
  WHERE type = 'recovery' AND status = 'approved' AND "shopId" = $1
  GROUP BY "shopId"
),
unpaid_credits AS (
  SELECT
    c."shopId", c.id, c."createdAt", c.amount, c."companyId", c.cum_credit,
    CASE
      WHEN c.cum_credit <= COALESCE(tr.val, 0) THEN 0
      WHEN (c.cum_credit - c.amount) >= COALESCE(tr.val, 0) THEN c.amount
      ELSE c.cum_credit - COALESCE(tr.val, 0)
    END AS remaining
  FROM credits c
  LEFT JOIN total_recoveries tr ON c."shopId" = tr."shopId"
)
SELECT
  s.id AS "shopId",
  s.name AS "shopName",
  s.area AS "shopArea",
  s.address AS "shopAddress",
  s.balance AS "totalBalance",
  s.phone AS "shopPhone",
  s."orderbookerId",
  u.name AS "orderbookerName",
  COALESCE(SUM(uc.remaining), 0) AS "fifoTotalBalance",
  MIN(uc."createdAt") FILTER (WHERE uc.remaining > 0) AS "oldestUnpaidCreditDate",
  COALESCE(
    SUM(uc.remaining) FILTER (WHERE uc."createdAt" < NOW() - INTERVAL '${OVERDUE_THRESHOLD_DAYS} days'),
    0
  ) AS "overdueAmount",
  EXTRACT(DAY FROM NOW() - MIN(uc."createdAt") FILTER (WHERE uc.remaining > 0))::int AS "daysOverdueDb",
  (
    SELECT json_agg(
      json_build_object(
        'date', uc2."createdAt",
        'amount', uc2.amount,
        'remaining', uc2.remaining,
        'daysOld', EXTRACT(DAY FROM NOW() - uc2."createdAt")::int,
        'companyId', uc2."companyId"
      ) ORDER BY uc2."createdAt"
    )
    FROM unpaid_credits uc2
    WHERE uc2."shopId" = s.id AND uc2.remaining > 0
    LIMIT 5
  ) AS "unpaidBillsJson",
  (
    SELECT string_agg(DISTINCT c.name, ', ')
    FROM "ShopCompanyBalance" scb
    JOIN "Company" c ON c.id = scb."companyId"
    WHERE scb."shopId" = s.id AND scb.balance > 0
    LIMIT 1
  ) AS "companyName"
FROM "Shop" s
LEFT JOIN unpaid_credits uc ON s.id = uc."shopId"
LEFT JOIN "User" u ON s."orderbookerId" = u.id
WHERE s.id = $1
GROUP BY s.id, s.name, s.area, s.address, s.balance, s.phone, s."orderbookerId", u.name
  `.trim();

  const res = await pool.query(query, [shopId]);
  if (res.rows.length === 0) return null;

  return mapRow(res.rows[0] as RawRow, OVERDUE_THRESHOLD_DAYS);
}
