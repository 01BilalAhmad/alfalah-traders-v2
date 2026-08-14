import { getPool } from '@/lib/pg';
// Re-export client-safe constants so server code can import everything
// from one place. Client components should import directly from
// '@/lib/tally-constants' to avoid pulling in pg.
export {
  DISCREPANCY_REASON_CODES,
  RESOLUTION_TYPES,
  REASON_CODE_LABELS,
  RESOLUTION_TYPE_LABELS,
} from './tally-constants';
export type { DiscrepancyReasonCode, ResolutionType } from './tally-constants';
import { DISCREPANCY_REASON_CODES } from './tally-constants';

/**
 * Ensures all Tally-system tables exist and have the required columns.
 * Safe to call repeatedly (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 *
 * Tables managed here:
 *   - ShopTally (extended with GPS, reasonCode, resolution, void, sessionId)
 *   - TellerAssignment (teller → OB mapping)
 *   - TellerSession (start/end GPS, area, tallies count)
 *   - Notification (persistent in-app notifications for admin & OBs)
 *
 * Shop.tallyFrequency is added via ensureShopColumns().
 */
export async function ensureTallyTables() {
  const pool = getPool();

  // ─── ShopTally (base table) ───────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "ShopTally" (
      "id" TEXT NOT NULL,
      "shopId" TEXT NOT NULL,
      "talliedBy" TEXT NOT NULL,
      "tallyDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "systemBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "shopBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "difference" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'verified',
      "notes" TEXT,
      "orderbookerId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ShopTally_pkey" PRIMARY KEY ("id")
    );
  `);

  // ─── ShopTally column extensions (idempotent) ─────────────────
  // GPS capture at the moment of tally
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "gpsLat" DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "gpsLng" DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "gpsAddress" TEXT`);
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "locationStatus" TEXT NOT NULL DEFAULT 'unverified'`);
  // reasonCode: structured reason for discrepancies (NULL when verified)
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "reasonCode" TEXT`);
  // Resolution workflow
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "resolutionStatus" TEXT NOT NULL DEFAULT 'open'`);
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "resolutionType" TEXT`);
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "resolutionNote" TEXT`);
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "resolvedBy" TEXT`);
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3)`);
  // Void mechanism
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "voided" BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "voidReason" TEXT`);
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "voidedBy" TEXT`);
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3)`);
  // Session link
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "sessionId" TEXT`);
  // Company link — which company this tally is for (for multi-company shops)
  await pool.query(`ALTER TABLE "ShopTally" ADD COLUMN IF NOT EXISTS "companyId" TEXT`);

  // Indexes
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_shopId_idx" ON "ShopTally"("shopId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_talliedBy_idx" ON "ShopTally"("talliedBy")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_orderbookerId_idx" ON "ShopTally"("orderbookerId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_tallyDate_idx" ON "ShopTally"("tallyDate")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_status_idx" ON "ShopTally"("status")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_resolutionStatus_idx" ON "ShopTally"("resolutionStatus")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_voided_idx" ON "ShopTally"("voided")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_sessionId_idx" ON "ShopTally"("sessionId")`);
  } catch { /* ignore */ }

  // ─── TellerAssignment ─────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "TellerAssignment" (
      "id" TEXT NOT NULL,
      "tellerId" TEXT NOT NULL,
      "orderbookerId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TellerAssignment_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "TellerAssignment_tellerId_orderbookerId_key" UNIQUE ("tellerId", "orderbookerId")
    );
  `);
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS "TellerAssignment_tellerId_idx" ON "TellerAssignment"("tellerId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "TellerAssignment_orderbookerId_idx" ON "TellerAssignment"("orderbookerId")`);
  } catch { /* ignore */ }

  // ─── TellerSession ────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "TellerSession" (
      "id" TEXT NOT NULL,
      "tellerId" TEXT NOT NULL,
      "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "endTime" TIMESTAMP(3),
      "startGpsLat" DOUBLE PRECISION,
      "startGpsLng" DOUBLE PRECISION,
      "startGpsAddress" TEXT,
      "endGpsLat" DOUBLE PRECISION,
      "endGpsLng" DOUBLE PRECISION,
      "endGpsAddress" TEXT,
      "area" TEXT,
      "notes" TEXT,
      "talliesCount" INTEGER NOT NULL DEFAULT 0,
      "discrepanciesCount" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'active',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TellerSession_pkey" PRIMARY KEY ("id")
    );
  `);
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS "TellerSession_tellerId_idx" ON "TellerSession"("tellerId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "TellerSession_status_idx" ON "TellerSession"("status")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "TellerSession_startTime_idx" ON "TellerSession"("startTime")`);
  } catch { /* ignore */ }

  // ─── Notification (persistent in-app notifications) ───────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Notification" (
      "id" TEXT NOT NULL,
      "userId" TEXT,
      "role" TEXT,
      "type" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "meta" JSONB,
      "read" BOOLEAN NOT NULL DEFAULT false,
      "readAt" TIMESTAMP(3),
      "actionRoute" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
    );
  `);
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "Notification_role_idx" ON "Notification"("role")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "Notification_read_idx" ON "Notification"("read")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt")`);
  } catch { /* ignore */ }

  // ─── Shop extensions (tallyFrequency) ─────────────────────────
  await ensureShopColumns();
}

/**
 * Adds tally-related columns to the Shop table.
 * - tallyFrequency: daily | weekly | monthly | quarterly | none
 */
export async function ensureShopColumns() {
  const pool = getPool();
  await pool.query(`ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "tallyFrequency" TEXT NOT NULL DEFAULT 'monthly'`);
}

/**
 * Helper: insert a Notification row (best-effort, non-blocking).
 * If userId is null and role is provided, the notification is broadcast
 * to all users with that role (admin / orderbooker / teller).
 */
export async function insertNotification(opts: {
  userId?: string | null;
  role?: string | null;
  type: string;
  title: string;
  description?: string;
  meta?: Record<string, any>;
  actionRoute?: string;
}): Promise<void> {
  try {
    const pool = getPool();
    const crypto = await import('crypto');
    const id = `notif_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
    await pool.query(
      `INSERT INTO "Notification" (id, "userId", role, type, title, description, meta, "actionRoute", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        id,
        opts.userId ?? null,
        opts.role ?? null,
        opts.type,
        opts.title,
        opts.description ?? null,
        opts.meta ? JSON.stringify(opts.meta) : null,
        opts.actionRoute ?? null,
      ],
    );
  } catch (err) {
    console.error('[insertNotification] failed:', err);
  }
}

// Constants (DISCREPANCY_REASON_CODES, RESOLUTION_TYPES, REASON_CODE_LABELS,
// RESOLUTION_TYPE_LABELS) are re-exported from './tally-constants' at the
// top of this file.
