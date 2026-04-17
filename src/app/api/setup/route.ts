import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// CREATE TABLE statements for PostgreSQL
const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'orderbooker',
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE INDEX IF NOT EXISTS "User_username_idx" ON "User"("username");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

CREATE TABLE IF NOT EXISTS "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerName" TEXT,
    "area" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "routeDay" TEXT NOT NULL,
    "orderbookerId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shop_orderbookerId_fkey" FOREIGN KEY ("orderbookerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Shop_orderbookerId_idx" ON "Shop"("orderbookerId");
CREATE INDEX IF NOT EXISTS "Shop_routeDay_idx" ON "Shop"("routeDay");
CREATE INDEX IF NOT EXISTS "Shop_name_idx" ON "Shop"("name");
CREATE INDEX IF NOT EXISTS "Shop_area_idx" ON "Shop"("area");

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Transaction_shopId_idx" ON "Transaction"("shopId");
CREATE INDEX IF NOT EXISTS "Transaction_type_idx" ON "Transaction"("type");
CREATE INDEX IF NOT EXISTS "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX IF NOT EXISTS "Transaction_createdBy_idx" ON "Transaction"("createdBy");
CREATE INDEX IF NOT EXISTS "Transaction_createdAt_idx" ON "Transaction"("createdAt");

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
    CONSTRAINT "AuditLog_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_idx" ON "AuditLog"("entityType");
CREATE INDEX IF NOT EXISTS "AuditLog_performedBy_idx" ON "AuditLog"("performedBy");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
`;

// POST /api/setup — Create tables + users
export async function POST() {
  try {
    // Step 1: Create tables
    await db.$executeRawUnsafe(CREATE_TABLES_SQL);

    // Step 2: Check if users already exist
    const userCount = await db.user.count();
    if (userCount > 0) {
      return NextResponse.json({ success: true, message: 'Tables and users already exist', userCount });
    }

    // Step 3: Create users
    const adminPass = await bcrypt.hash('@AFE@123654', 10);
    const obPass = await bcrypt.hash('ob123', 10);

    await db.user.create({
      data: {
        username: 'al-falah trader',
        password: adminPass,
        name: 'AL-FALAH TRADER',
        role: 'admin',
        phone: '',
        status: 'active',
      },
    });

    await db.user.create({
      data: {
        username: 'ahmed',
        password: obPass,
        name: 'Ahmed Khan',
        role: 'orderbooker',
        phone: '',
        status: 'active',
      },
    });

    await db.user.create({
      data: {
        username: 'bilal',
        password: obPass,
        name: 'Bilal Ali',
        role: 'orderbooker',
        phone: '',
        status: 'active',
      },
    });

    await db.user.create({
      data: {
        username: 'ob01',
        password: obPass,
        name: 'Danish Ramzan',
        role: 'orderbooker',
        phone: '',
        status: 'active',
      },
    });

    await db.user.create({
      data: {
        username: 'ob02',
        password: obPass,
        name: 'Kashif Khan',
        role: 'orderbooker',
        phone: '',
        status: 'active',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'All tables created and 5 users seeded',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Setup error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/setup — Check status
export async function GET() {
  try {
    const userCount = await db.user.count();
    return NextResponse.json({ needsSetup: userCount === 0, userCount });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg, needsSetup: true }, { status: 500 });
  }
}
