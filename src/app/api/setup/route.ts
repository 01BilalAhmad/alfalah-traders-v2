import { NextResponse } from 'next/server';
import pg from 'pg';

const { Client } = pg;

// POST /api/setup — Create tables using raw pg (no Prisma)
export async function POST() {
  let client;
  try {
    client = new Client({ connectionString: process.env.DATABASE_URL });
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
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Shop table
    await client.query(`
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

    // Check if users exist
    const userRes = await client.query('SELECT COUNT(*) as count FROM "User"');
    const userCount = parseInt(userRes.rows[0].count);

    if (userCount > 0) {
      return NextResponse.json({ success: true, message: 'Tables exist, users already seeded', userCount });
    }

    // Hash passwords (simple sync-compatible way)
    const bcrypt = await import('bcryptjs');
    const adminPass = await bcrypt.hash('@AFE@123654', 10);
    const obPass = await bcrypt.hash('ob123', 10);

    // Insert users
    await client.query(
      'INSERT INTO "User" (id, username, password, name, role, phone, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['admin-001', 'al-falah trader', adminPass, 'AL-FALAH TRADER', 'admin', '', 'active']
    );
    await client.query(
      'INSERT INTO "User" (id, username, password, name, role, phone, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['ob-ahmed', 'ahmed', obPass, 'Ahmed Khan', 'orderbooker', '', 'active']
    );
    await client.query(
      'INSERT INTO "User" (id, username, password, name, role, phone, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['ob-bilal', 'bilal', obPass, 'Bilal Ali', 'orderbooker', '', 'active']
    );
    await client.query(
      'INSERT INTO "User" (id, username, password, name, role, phone, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['ob-danish', 'ob01', obPass, 'Danish Ramzan', 'orderbooker', '', 'active']
    );
    await client.query(
      'INSERT INTO "User" (id, username, password, name, role, phone, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['ob-kashif', 'ob02', obPass, 'Kashif Khan', 'orderbooker', '', 'active']
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
    client = new Client({ connectionString: process.env.DATABASE_URL });
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
