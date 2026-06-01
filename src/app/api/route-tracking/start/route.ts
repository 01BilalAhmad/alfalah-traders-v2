import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import crypto from 'crypto';

// POST /api/route-tracking/start
// Start a new route tracking session
export async function POST(request: NextRequest) {
  try {
    const { orderbookerId, companyId, lat, lng } = await request.json();

    if (!orderbookerId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'orderbookerId, lat, and lng are required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // First: ensure RouteTracking table exists
    try {
      await pool.query(`SELECT 1 FROM "RouteTracking" LIMIT 1`);
    } catch {
      // Table doesn't exist — create all route tracking tables
      console.log('[RouteTracking/Start] RouteTracking table not found, creating tables...');
      try {
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
        // Add indexes
        try {
          await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_orderbookerId_idx" ON "RouteTracking"("orderbookerId")`);
          await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_status_idx" ON "RouteTracking"("status")`);
          await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_startTime_idx" ON "RouteTracking"("startTime")`);
        } catch { /* ignore */ }
        console.log('[RouteTracking/Start] RouteTracking table created successfully');
      } catch (createErr: unknown) {
        const createMsg = createErr instanceof Error ? createErr.message : '';
        console.error('[RouteTracking/Start] Failed to create RouteTracking table:', createMsg);
        return NextResponse.json(
          { error: 'Failed to initialize route tracking. Please try again.' },
          { status: 500 }
        );
      }
    }

    // Ensure RouteWaypoint table exists
    try {
      await pool.query(`SELECT 1 FROM "RouteWaypoint" LIMIT 1`);
    } catch {
      console.log('[RouteTracking/Start] RouteWaypoint table not found, creating...');
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "RouteWaypoint" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "routeId" TEXT NOT NULL,
            "lat" DOUBLE PRECISION NOT NULL,
            "lng" DOUBLE PRECISION NOT NULL,
            "accuracy" DOUBLE PRECISION,
            "timestamp" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "RouteWaypoint_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "RouteTracking"("id") ON DELETE CASCADE
          );
        `);
        try {
          await pool.query(`CREATE INDEX IF NOT EXISTS "RouteWaypoint_routeId_idx" ON "RouteWaypoint"("routeId")`);
          await pool.query(`CREATE INDEX IF NOT EXISTS "RouteWaypoint_timestamp_idx" ON "RouteWaypoint"("timestamp")`);
        } catch { /* ignore */ }
        console.log('[RouteTracking/Start] RouteWaypoint table created successfully');
      } catch (createErr: unknown) {
        console.error('[RouteTracking/Start] Failed to create RouteWaypoint table:', createErr instanceof Error ? createErr.message : '');
        // Don't fail — route can still start without waypoints table (will be created later)
      }
    }

    // Ensure RouteStop table exists
    try {
      await pool.query(`SELECT 1 FROM "RouteStop" LIMIT 1`);
    } catch {
      console.log('[RouteTracking/Start] RouteStop table not found, creating...');
      try {
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
        try {
          await pool.query(`CREATE INDEX IF NOT EXISTS "RouteStop_routeId_idx" ON "RouteStop"("routeId")`);
          await pool.query(`CREATE INDEX IF NOT EXISTS "RouteStop_shopId_idx" ON "RouteStop"("shopId")`);
        } catch { /* ignore */ }
        console.log('[RouteTracking/Start] RouteStop table created successfully');
      } catch (createErr: unknown) {
        console.error('[RouteTracking/Start] Failed to create RouteStop table:', createErr instanceof Error ? createErr.message : '');
        // Don't fail — route can still start without stops table
      }
    }

    // Add missing columns if they don't exist (migration for existing tables)
    try { await pool.query(`ALTER TABLE "RouteTracking" ADD COLUMN IF NOT EXISTS "routeDate" DATE`); } catch { /* ignore */ }
    try { await pool.query(`ALTER TABLE "RouteTracking" ADD COLUMN IF NOT EXISTS "totalDistance" DOUBLE PRECISION`); } catch { /* ignore */ }
    try { await pool.query(`ALTER TABLE "RouteTracking" ADD COLUMN IF NOT EXISTS "totalDuration" INTEGER`); } catch { /* ignore */ }

    // Check if the orderbooker already has an ongoing route
    const existingRes = await pool.query(
      `SELECT id, "startTime" FROM "RouteTracking" WHERE "orderbookerId" = $1 AND status = 'ongoing'`,
      [orderbookerId]
    );

    if (existingRes.rows.length > 0) {
      const ongoingRoute = existingRes.rows[0];
      const startTime = new Date(ongoingRoute.startTime);
      const hoursSinceStart = (Date.now() - startTime.getTime()) / (1000 * 60 * 60);

      // Auto-complete old ongoing routes that are older than 24 hours
      // (they were probably abandoned/crashed)
      if (hoursSinceStart > 24) {
        console.log(`[RouteTracking/Start] Auto-completing abandoned route ${ongoingRoute.id} (${hoursSinceStart.toFixed(1)}h old)`);
        await pool.query(
          `UPDATE "RouteTracking" SET status = 'completed', "endTime" = NOW(), "totalDuration" = EXTRACT(EPOCH FROM (NOW() - "startTime"))::INTEGER, "updatedAt" = NOW() WHERE id = $1`,
          [ongoingRoute.id]
        );
      } else {
        // Route is genuinely ongoing (less than 24h old)
        // Return the existing ongoing route ID so the app can resume it
        return NextResponse.json({
          id: ongoingRoute.id,
          orderbookerId: orderbookerId,
          status: 'ongoing',
          message: 'You already have an ongoing route. Resuming it.',
          resumed: true,
        }, { status: 200 });
      }
    }

    const routeId = `rt_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;

    // Try INSERT with routeDate column first; if fails, fall back to without it
    let result;
    try {
      result = await pool.query(
        `INSERT INTO "RouteTracking" (id, "orderbookerId", "companyId", status, "startLat", "startLng", "startTime", "routeDate", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), CURRENT_DATE, NOW(), NOW())
         RETURNING *`,
        [routeId, orderbookerId, companyId || null, 'ongoing', lat, lng]
      );
    } catch (insertError: unknown) {
      const insertMsg = insertError instanceof Error ? insertError.message : '';
      // If routeDate column doesn't exist, try without it
      if (insertMsg.includes('routeDate') || insertMsg.includes('column') || insertMsg.includes('does not exist')) {
        console.warn('[RouteTracking/Start] routeDate column not found, inserting without it.');
        result = await pool.query(
          `INSERT INTO "RouteTracking" (id, "orderbookerId", "companyId", status, "startLat", "startLng", "startTime", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
           RETURNING *`,
          [routeId, orderbookerId, companyId || null, 'ongoing', lat, lng]
        );
      } else {
        throw insertError;
      }
    }

    const route = result.rows[0];

    return NextResponse.json({
      id: route.id,
      orderbookerId: route.orderbookerId,
      companyId: route.companyId,
      status: route.status,
      startLat: Number(route.startLat),
      startLng: Number(route.startLng),
      startTime: route.startTime instanceof Date ? route.startTime.toISOString() : route.startTime,
      createdAt: route.createdAt instanceof Date ? route.createdAt.toISOString() : route.createdAt,
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RouteTracking/Start] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
