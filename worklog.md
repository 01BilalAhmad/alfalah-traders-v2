# Worklog: Fix AuditLog INSERT & Missing NOT NULL Column Bugs

## Date: $(date -u)

## Problem
PostgreSQL database columns with `NOT NULL` constraint and `NO DEFAULT` were causing 500 errors on INSERT because raw SQL queries omitted them:
- `id` on `AuditLog` table (TEXT NOT NULL, NO DEFAULT)
- `id` on `User` table (TEXT NOT NULL, NO DEFAULT)
- `updatedAt` on `User` table (TIMESTAMP NOT NULL, NO DEFAULT — per production schema)

## Changes Made

### 1. `/src/app/api/shops/route.ts` — 2 AuditLog INSERTs fixed
- **POST (line ~113):** Added `id` column to AuditLog INSERT for shop creation audit. Generated ID with `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`. Shifted all param indices by 1 ($1→$2, $2→$3, $3→$4).
- **PATCH (line ~175):** Added `id` column to AuditLog INSERT for shop update audit. Same ID generation pattern. Shifted all param indices by 1 ($1→$2, ..., $4→$5).
- `import crypto` was already present.

### 2. `/src/app/api/transactions/route.ts` — 3 AuditLog INSERTs fixed
- **POST (line ~285):** Added `id` column to AuditLog INSERT for credit/recovery entry. Shifted param indices by 1 ($1→$2, ..., $5→$6). Action value moved from inline literal to param $2.
- **PATCH (line ~410):** Added `id` column to AuditLog INSERT for transaction edit. Shifted param indices by 1 ($1→$2, ..., $5→$6).
- **DELETE (line ~514):** Added `id` column to AuditLog INSERT for transaction deletion. Shifted param indices by 1 ($1→$2, ..., $5→$6).
- `import crypto` was already present.

### 3. `/src/app/api/orderbookers/route.ts` — 2 AuditLog INSERTs + 1 User INSERT fixed
- **Added `import crypto from 'crypto'`** at top of file.
- **POST User INSERT (line ~86):** Added `id` (generated: `user_${timestamp}_${random}`), `status` ('active'), `createdAt` (now), `updatedAt` (now) to User INSERT. Previously missing `id` and `updatedAt` which are NOT NULL NO DEFAULT.
- **POST AuditLog (line ~99):** Added `id` column to AuditLog INSERT for orderbooker creation. Shifted param indices by 1.
- **PATCH AuditLog (line ~164):** Added `id` column to AuditLog INSERT for orderbooker update. Shifted param indices by 1.

### 4. `/src/app/api/recoveries/route.ts` — 1 AuditLog INSERT fixed
- **Added `import crypto from 'crypto'`** at top of file.
- **POST (line ~196):** Added `id` column to AuditLog INSERT for recovery approve/reject. Shifted param indices by 1. Action value moved from inline literal to param $2.

### 5. `/src/app/api/shops/bulk-status/route.ts` — 1 AuditLog INSERT fixed
- **Added `import crypto from 'crypto'`** at top of file.
- **PATCH (line ~35):** Added `id` column to AuditLog INSERT for bulk status change. Shifted param indices by 1 ($1→$2, $2→$3).

### 6. `/src/app/api/shops/bulk-assign/route.ts` — 1 AuditLog INSERT fixed
- **Added `import crypto from 'crypto'`** at top of file.
- **PATCH (line ~52):** Added `id` column to AuditLog INSERT for bulk assign. Shifted param indices by 1 ($1→$2, $2→$3).

### 7. `/src/app/api/setup/route.ts` — 5 User INSERTs hardened
- Added `"createdAt"` and `"updatedAt"` columns to all 5 User INSERT statements (admin + 4 orderbookers). A single `now` timestamp is generated and used for all inserts. Previously `id` was present but `createdAt`/`updatedAt` relied on DDL defaults — this makes the setup resilient even if the table was created without those defaults.

## Summary
- **Total AuditLog INSERTs fixed:** 10 (across 6 files)
- **Total User INSERTs fixed:** 6 (1 in orderbookers, 5 in setup)
- **Files with `import crypto` added:** 4 (orderbookers, recoveries, bulk-status, bulk-assign)
- **Files with `import crypto` already present:** 2 (shops, transactions)
- **Lint result:** No new errors introduced. One pre-existing lint error in `ServerSettings.tsx` (unrelated react-hooks/set-state-in-effect).
- **NOT modified:** `auth/login/route.ts`, Prisma schema, any component files.

---
Task ID: main-fix
Agent: Main Agent
Task: Fix transaction and shop creation failures - investigate and resolve root cause

Work Log:
- User reported: "Transaction create nai ho rhi ab" and earlier "shop create nai ho rhi admin panel Sy"
- Discovered root cause: DATABASE_URL in .env was SQLite (`file:/home/z/my-project/db/custom.db`) but ALL API routes use `pg` (PostgreSQL) library
- This caused ALL POST operations to fail with ECONNREFUSED on local environment
- Set up local PostgreSQL 17 server (downloaded Debian packages, extracted to ~/pg-local, initialized data dir ~/pg-data)
- Changed .env to `DATABASE_URL=postgresql://z@127.0.0.1:5433/alfalah`
- Pushed Prisma schema to local PostgreSQL and seeded with admin, 2 orderbookers, 20 shops, 20 transactions
- Discovered SECOND root cause: Raw SQL INSERT queries missing NOT NULL columns with NO DEFAULT:
  - Shop INSERT missing `updatedAt` column → "null value in column updatedAt violates not-null constraint"
  - Transaction INSERT missing `id` column → "null value in column id violates not-null constraint"
  - 10 AuditLog INSERTs missing `id` column across 6 files
  - User INSERTs in orderbookers route and setup route missing `id` and/or `updatedAt`
- Fixed all INSERT queries across 7 API route files
- Verified all fixes: login ✅, shop create ✅, transaction create ✅, shops list ✅, transactions list ✅

Stage Summary:
- **ROOT CAUSE 1 (Critical)**: Database column mismatch - raw SQL INSERT queries omitted NOT NULL columns (id, updatedAt) that had no database DEFAULT values. Prisma's @default(cuid()) and @updatedAt create client-side defaults, NOT SQL DEFAULTs.
- **ROOT CAUSE 2 (Local only)**: .env had SQLite DATABASE_URL while code uses PostgreSQL pg library
- **Files Modified**: 7 API route files (shops, transactions, orderbookers, recoveries, bulk-status, bulk-assign, setup)
- **Local PostgreSQL setup**: Installed PostgreSQL 17 at ~/pg-local, data at ~/pg-data, port 5433, database "alfalah"
- **Login credentials**: admin/Admin@123 (Admin), ahmed/ob123, bilal/ob123 (Orderbookers)
- **No changes to**: auth/login/route.ts, Prisma schema, frontend components
- **IMPORTANT for Vercel**: These same bugs would affect the live Vercel site IF the Neon database was created with the same Prisma schema (which it was). The fixes are critical for production.
