import { NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// POST /api/setup — Create tables using raw pg (no Prisma)
export async function POST() {
  let client;
  try {
    client = getPgClient();
    await client.connect();

    // Create User table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "username" TEXT NOT NULL UNIQUE,
        "password" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'orderbooker',
        "phone" TEXT,
        "status" TEXT NOT NULL DEFAULT 'active',
        "allRoutesEnabled" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add allRoutesEnabled column if it doesn't exist (migration for existing databases)
    try {
      await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "allRoutesEnabled" BOOLEAN NOT NULL DEFAULT false`);
    } catch { /* column already exists, ignore */ }

    // Create Shop table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Shop" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "ownerName" TEXT,
        "area" TEXT,
        "address" TEXT,
        "phone" TEXT,
        "routeDays" TEXT[] NOT NULL,
        "orderbookerId" TEXT NOT NULL,
        "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Shop_orderbookerId_fkey" FOREIGN KEY ("orderbookerId") REFERENCES "User"("id")
      );
    `);

    // Create Transaction table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Transaction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "shopId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'approved',
        "amount" DOUBLE PRECISION NOT NULL,
        "previousBalance" DOUBLE PRECISION NOT NULL,
        "newBalance" DOUBLE PRECISION NOT NULL,
        "description" TEXT,
        "createdBy" TEXT NOT NULL,
        "approvedBy" TEXT,
        "approvedAt" TIMESTAMP(3),
        "rejectReason" TEXT,
        "gpsLat" DOUBLE PRECISION,
        "gpsLng" DOUBLE PRECISION,
        "gpsAddress" TEXT,
        "companyId" TEXT,
        "idempotencyKey" TEXT UNIQUE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Transaction_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id"),
        CONSTRAINT "Transaction_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id")
      );
    `);

    // Create AuditLog table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "AuditLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "action" TEXT NOT NULL,
        "entityType" TEXT NOT NULL,
        "entityId" TEXT,
        "performedBy" TEXT,
        "oldValue" TEXT,
        "newValue" TEXT,
        "description" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AuditLog_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id")
      );
    `);

    // ============================================
    // New tables for mobile app features
    // ============================================

    // ShopNote table - shop notes/remarks
    await client.query(`
      CREATE TABLE IF NOT EXISTS "ShopNote" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "shopId" TEXT NOT NULL,
        "note" TEXT NOT NULL,
        "createdBy" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ShopNote_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
        CONSTRAINT "ShopNote_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id")
      );
    `);

    // ShopNote indexes
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS "ShopNote_shopId_idx" ON "ShopNote"("shopId")`);
      await client.query(`CREATE INDEX IF NOT EXISTS "ShopNote_createdBy_idx" ON "ShopNote"("createdBy")`);
    } catch { /* index already exists, ignore */ }

    // ShopVisit table - GPS visit verification
    await client.query(`
      CREATE TABLE IF NOT EXISTS "ShopVisit" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "shopId" TEXT NOT NULL,
        "orderbookerId" TEXT NOT NULL,
        "gpsLat" DOUBLE PRECISION,
        "gpsLng" DOUBLE PRECISION,
        "gpsAddress" TEXT,
        "inRange" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ShopVisit_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
        CONSTRAINT "ShopVisit_orderbookerId_fkey" FOREIGN KEY ("orderbookerId") REFERENCES "User"("id")
      );
    `);

    // ShopVisit indexes
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS "ShopVisit_shopId_idx" ON "ShopVisit"("shopId")`);
      await client.query(`CREATE INDEX IF NOT EXISTS "ShopVisit_orderbookerId_idx" ON "ShopVisit"("orderbookerId")`);
      await client.query(`CREATE INDEX IF NOT EXISTS "ShopVisit_createdAt_idx" ON "ShopVisit"("createdAt")`);
    } catch { /* index already exists, ignore */ }

    // DailyTarget table - monthly recovery targets
    await client.query(`
      CREATE TABLE IF NOT EXISTS "DailyTarget" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orderbookerId" TEXT NOT NULL,
        "target" DOUBLE PRECISION NOT NULL,
        "month" TEXT NOT NULL,
        "createdBy" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DailyTarget_orderbookerId_fkey" FOREIGN KEY ("orderbookerId") REFERENCES "User"("id"),
        CONSTRAINT "DailyTarget_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id"),
        CONSTRAINT "DailyTarget_orderbookerId_month_key" UNIQUE ("orderbookerId", "month")
      );
    `);

    // DailyTarget indexes
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS "DailyTarget_orderbookerId_idx" ON "DailyTarget"("orderbookerId")`);
      await client.query(`CREATE INDEX IF NOT EXISTS "DailyTarget_month_idx" ON "DailyTarget"("month")`);
    } catch { /* index already exists, ignore */ }

    // UserPreference table - app preferences (tour completed etc)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "UserPreference" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE,
        "tourCompleted" BOOLEAN NOT NULL DEFAULT false,
        "preferences" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      );
    `);

    // UserPreference index
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS "UserPreference_userId_idx" ON "UserPreference"("userId")`);
    } catch { /* index already exists, ignore */ }

    // Check if users exist
    const userRes = await client.query('SELECT COUNT(*) as count FROM "User"');
    const userCount = parseInt(userRes.rows[0].count);

    // Always run migrations for existing databases
    try {
      await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "allRoutesEnabled" BOOLEAN NOT NULL DEFAULT false`);
    } catch { /* column already exists, ignore */ }

    // Migration: Convert routeDay (TEXT) to routeDays (TEXT[]) — safe, no data loss
    try {
      // Step 1: Add routeDays column if it doesn't exist
      const routeDaysColRes = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Shop' AND column_name = 'routeDays'
      `);
      if (routeDaysColRes.rows.length === 0) {
        // Step 2: Check if old routeDay column exists
        const routeDayColRes = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'Shop' AND column_name = 'routeDay'
        `);
        if (routeDayColRes.rows.length > 0) {
          // Step 3: Add new routeDays column, copy data from routeDay
          await client.query(`ALTER TABLE "Shop" ADD COLUMN "routeDays" TEXT[]`);
          // Copy each shop's routeDay to routeDays as single-element array
          await client.query(`UPDATE "Shop" SET "routeDays" = ARRAY[LOWER("routeDay")] WHERE "routeDay" IS NOT NULL`);
          // Set default for any nulls
          await client.query(`UPDATE "Shop" SET "routeDays" = ARRAY['monday'] WHERE "routeDays" IS NULL`);
          // Make column NOT NULL
          await client.query(`ALTER TABLE "Shop" ALTER COLUMN "routeDays" SET NOT NULL`);
          // Drop old column
          await client.query(`ALTER TABLE "Shop" DROP COLUMN "routeDay"`);
          console.log('Migration: routeDay → routeDays completed successfully');
        } else {
          // No routeDay column exists, just add routeDays
          await client.query(`ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "routeDays" TEXT[] NOT NULL DEFAULT ARRAY['monday']`);
        }
      }
      // Add GIN index for array containment queries
      try {
        await client.query(`CREATE INDEX IF NOT EXISTS "Shop_routeDays_idx" ON "Shop" USING GIN ("routeDays")`);
      } catch { /* index might already exist */ }
    } catch (migrateErr) {
      console.error('routeDay → routeDays migration error:', migrateErr);
      /* non-critical, continue */
    }

    // Migration: Add companyId column to User if it doesn't exist
    try {
      await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyId" TEXT`);
    } catch { /* column already exists, ignore */ }

    // Migration: Add companyId column to Transaction if it doesn't exist
    try {
      await client.query(`ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "companyId" TEXT`);
    } catch { /* column already exists, ignore */ }

    // Migration: Add idempotencyKey column to Transaction for duplicate prevention
    try {
      await client.query(`ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT UNIQUE`);
    } catch { /* column already exists, ignore */ }

    // Migration: Create ShopCompanyBalance table if it doesn't exist
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "ShopCompanyBalance" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "shopId" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ShopCompanyBalance_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
          CONSTRAINT "ShopCompanyBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
          CONSTRAINT "ShopCompanyBalance_shopId_companyId_key" UNIQUE ("shopId", "companyId")
        )
      `);
    } catch { /* table already exists, ignore */ }

    // Migration: Create Company table if it doesn't exist
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "Company" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "name" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'active',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch { /* table already exists, ignore */ }

    if (userCount > 0) {
      await client.end();
      return NextResponse.json({ success: true, message: 'Tables exist, migrations applied', userCount });
    }

    // Hash passwords (simple sync-compatible way)
    const bcrypt = await import('bcryptjs');
    const adminPass = await bcrypt.hash('@AFE@123654', 10);
    const obPass = await bcrypt.hash('ob123', 10);

    // Insert users
    const now = new Date().toISOString();
    await client.query(
      'INSERT INTO "User" (id, username, password, name, role, phone, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      ['admin-001', 'al-falah trader', adminPass, 'AL-FALAH TRADER', 'admin', '', 'active', now, now]
    );
    await client.query(
      'INSERT INTO "User" (id, username, password, name, role, phone, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      ['ob-ahmed', 'ahmed', obPass, 'Ahmed Khan', 'orderbooker', '', 'active', now, now]
    );
    await client.query(
      'INSERT INTO "User" (id, username, password, name, role, phone, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      ['ob-bilal', 'bilal', obPass, 'Bilal Ali', 'orderbooker', '', 'active', now, now]
    );
    await client.query(
      'INSERT INTO "User" (id, username, password, name, role, phone, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      ['ob-danish', 'ob01', obPass, 'Danish Ramzan', 'orderbooker', '', 'active', now, now]
    );
    await client.query(
      'INSERT INTO "User" (id, username, password, name, role, phone, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      ['ob-kashif', 'ob02', obPass, 'Kashif Khan', 'orderbooker', '', 'active', now, now]
    );

    await client.end();

    return NextResponse.json({ success: true, message: 'All tables created + 5 users seeded!' });
  } catch (error: unknown) {
    if (client) await client.end().catch(() => {});
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Setup error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  let client;
  try {
    client = getPgClient();
    await client.connect();
    const res = await client.query('SELECT COUNT(*) as count FROM "User"');
    await client.end();
    const count = parseInt(res.rows[0].count);
    return NextResponse.json({ needsSetup: count === 0, userCount: count });
  } catch (error: unknown) {
    if (client) await client.end().catch(() => {});
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg, needsSetup: true }, { status: 500 });
  }
}
