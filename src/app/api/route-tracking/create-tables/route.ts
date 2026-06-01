import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// POST /api/route-tracking/create-tables
// Create the RouteTracking, RouteWaypoint, and RouteStop tables if they don't exist
export async function POST() {
  try {
    const pool = getPool();

    // Create RouteTracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "RouteTracking" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orderbookerId" TEXT NOT NULL,
        "companyId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ongoing',
        "startLat" DOUBLE PRECISION,
        "startLng" DOUBLE PRECISION,
        "endLat" DOUBLE PRECISION,
        "endLng" DOUBLE PRECISION,
        "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "endTime" TIMESTAMP(3),
        "totalDuration" INTEGER,
        "totalDistance" DOUBLE PRECISION,
        "routeDate" DATE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RouteTracking_orderbookerId_fkey" FOREIGN KEY ("orderbookerId") REFERENCES "User"("id")
      );
    `);

    // Add routeDate column if it doesn't exist (migration for existing tables)
    try {
      await pool.query(`ALTER TABLE "RouteTracking" ADD COLUMN IF NOT EXISTS "routeDate" DATE`);
    } catch { /* column may already exist, ignore */ }

    // Add totalDistance column if it doesn't exist (migration for existing tables)
    try {
      await pool.query(`ALTER TABLE "RouteTracking" ADD COLUMN IF NOT EXISTS "totalDistance" DOUBLE PRECISION`);
    } catch { /* column may already exist, ignore */ }

    // Add totalDuration column if it doesn't exist (migration for existing tables)
    try {
      await pool.query(`ALTER TABLE "RouteTracking" ADD COLUMN IF NOT EXISTS "totalDuration" INTEGER`);
    } catch { /* column may already exist, ignore */ }

    // RouteTracking indexes
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_orderbookerId_idx" ON "RouteTracking"("orderbookerId")`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_status_idx" ON "RouteTracking"("status")`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_startTime_idx" ON "RouteTracking"("startTime")`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_companyId_idx" ON "RouteTracking"("companyId")`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_routeDate_idx" ON "RouteTracking"("routeDate")`);
    } catch { /* indexes may already exist, ignore */ }

    // Create RouteWaypoint table (matches Prisma schema - no createdAt initially)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "RouteWaypoint" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "routeId" TEXT NOT NULL,
        "lat" DOUBLE PRECISION NOT NULL,
        "lng" DOUBLE PRECISION NOT NULL,
        "accuracy" DOUBLE PRECISION,
        "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RouteWaypoint_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "RouteTracking"("id") ON DELETE CASCADE
      );
    `);

    // Add createdAt column if needed (for compatibility)
    try {
      await pool.query(`ALTER TABLE "RouteWaypoint" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    } catch { /* ignore */ }

    // RouteWaypoint indexes
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS "RouteWaypoint_routeId_idx" ON "RouteWaypoint"("routeId")`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "RouteWaypoint_timestamp_idx" ON "RouteWaypoint"("timestamp")`);
    } catch { /* indexes may already exist, ignore */ }

    // Create RouteStop table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "RouteStop" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "routeId" TEXT NOT NULL,
        "shopId" TEXT NOT NULL,
        "lat" DOUBLE PRECISION,
        "lng" DOUBLE PRECISION,
        "arrivalTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "departureTime" TIMESTAMP(3),
        "timeSpent" INTEGER,
        "recoveryAmount" DOUBLE PRECISION,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "RouteTracking"("id") ON DELETE CASCADE,
        CONSTRAINT "RouteStop_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
      );
    `);

    // RouteStop indexes
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS "RouteStop_routeId_idx" ON "RouteStop"("routeId")`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "RouteStop_shopId_idx" ON "RouteStop"("shopId")`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "RouteStop_arrivalTime_idx" ON "RouteStop"("arrivalTime")`);
    } catch { /* indexes may already exist, ignore */ }

    return NextResponse.json({
      success: true,
      message: 'Route tracking tables created/verified successfully',
      tables: ['RouteTracking', 'RouteWaypoint', 'RouteStop'],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating route tracking tables:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
