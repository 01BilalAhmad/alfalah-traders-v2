-- ─────────────────────────────────────────────────────────────────────
-- Finexa-AFE — Add compound indexes on "Transaction" table
-- ─────────────────────────────────────────────────────────────────────
-- Purpose: speed up the most common admin/mobile report queries.
-- Without these, every admin report scans the full Transaction table
-- once it grows past ~10k rows. FMCG distributors hit that in 6 months.
--
-- DEPLOYMENT: This migration is safe to run on a LIVE production database.
--   - CREATE INDEX CONCURRENTLY does NOT take an ACCESS EXCLUSIVE lock
--     on the table — other queries continue to run.
--   - Downside: takes longer than a regular CREATE INDEX, and you cannot
--     run it inside a transaction block.
--   - Run with: psql "$DATABASE_URL" -f this_file.sql
--     OR paste each statement individually into your DB console.
--   - The `IF NOT EXISTS` guard makes it idempotent.
-- ─────────────────────────────────────────────────────────────────────

-- 1. (shopId, createdAt) — shop ledger / shop detail analytics / shop balance trend.
--    Mobile app's /api/reports/ledger hits this pattern when an OB pulls a shop's account statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Transaction_shopId_createdAt_idx"
  ON "Transaction" ("shopId", "createdAt");

-- 2. (createdBy, createdAt) — orderbooker performance, daily activity, OB weekly report.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Transaction_createdBy_createdAt_idx"
  ON "Transaction" ("createdBy", "createdAt");

-- 3. (companyId, type, status, createdAt) — company-wise reports (monthly summary,
--    credit-recovery analysis, aging). The most expensive admin query today.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Transaction_companyId_type_status_createdAt_idx"
  ON "Transaction" ("companyId", "type", "status", "createdAt");

-- 4. (type, status, createdAt) — pending-recovery workflow:
--    SELECT ... WHERE type='recovery' AND status='pending' ORDER BY createdAt
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Transaction_type_status_createdAt_idx"
  ON "Transaction" ("type", "status", "createdAt");

-- 5. (shopId, type, createdAt) — shop balance recalculation utility
--    (recalc-balances.ts groups transactions per shop per type to recompute
--    the running balance after a correction).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Transaction_shopId_type_createdAt_idx"
  ON "Transaction" ("shopId", "type", "createdAt");

-- ─────────────────────────────────────────────────────────────────────
-- After running this migration, run the following to verify:
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'Transaction' ORDER BY indexname;
--
-- You should see all 11 indexes (6 original + 5 new compound).
-- ─────────────────────────────────────────────────────────────────────
