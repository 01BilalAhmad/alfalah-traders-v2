import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import crypto from 'crypto';

// Ensure RouteWaypoint table exists (called before any waypoint operations)
async function ensureWaypointTable(pool: ReturnType<typeof getPool>): Promise<void> {
  try {
    await pool.query(`SELECT 1 FROM "RouteWaypoint" LIMIT 1`);
  } catch {
    console.log('[Waypoints] RouteWaypoint table not found, creating...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "RouteWaypoint" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "routeId" TEXT NOT NULL,
        "lat" DOUBLE PRECISION NOT NULL,
        "lng" DOUBLE PRECISION NOT NULL,
        "accuracy" DOUBLE PRECISION,
        "timestamp" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS "RouteWaypoint_routeId_idx" ON "RouteWaypoint"("routeId")`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "RouteWaypoint_timestamp_idx" ON "RouteWaypoint"("timestamp")`);
    } catch { /* indexes may already exist */ }

    // Try adding foreign key constraint
    try {
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'RouteWaypoint_routeId_fkey') THEN
            ALTER TABLE "RouteWaypoint" ADD CONSTRAINT "RouteWaypoint_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "RouteTracking"("id") ON DELETE CASCADE;
          END IF;
        END $$;
      `);
    } catch { /* ignore FK error */ }

    console.log('[Waypoints] RouteWaypoint table created successfully');
  }
}

// POST /api/route-tracking/waypoints
// Save GPS waypoints collected during route (batch upload)
export async function POST(request: NextRequest) {
  try {
    const { routeId, waypoints } = await request.json();

    if (!routeId || !waypoints || !Array.isArray(waypoints) || waypoints.length === 0) {
      return NextResponse.json(
        { error: 'routeId and a non-empty waypoints array are required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Ensure RouteWaypoint table exists
    await ensureWaypointTable(pool);

    // Verify the route exists
    const routeRes = await pool.query(
      `SELECT id, status FROM "RouteTracking" WHERE id = $1`,
      [routeId]
    );

    if (routeRes.rows.length === 0) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    // Build batch insert query
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const wp of waypoints) {
      if (wp.lat === undefined || wp.lng === undefined) continue;

      const wpId = `wp_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}_${paramIndex}`;
      placeholders.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`
      );
      values.push(
        wpId,
        routeId,
        wp.lat,
        wp.lng,
        wp.accuracy ?? null,
        wp.timestamp ?? null,
        new Date().toISOString() // createdAt
      );
      paramIndex += 7;
    }

    if (placeholders.length === 0) {
      return NextResponse.json(
        { error: 'No valid waypoints provided' },
        { status: 400 }
      );
    }

    const insertQuery = `
      INSERT INTO "RouteWaypoint" (id, "routeId", lat, lng, accuracy, "timestamp", "createdAt")
      VALUES ${placeholders.join(', ')}
    `;

    await pool.query(insertQuery, values);

    return NextResponse.json({
      success: true,
      count: placeholders.length,
      routeId,
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error saving waypoints:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/route-tracking/waypoints?routeId=xxx
// Get waypoints for a route
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('routeId');

    if (!routeId) {
      return NextResponse.json(
        { error: 'routeId query parameter is required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Ensure RouteWaypoint table exists
    await ensureWaypointTable(pool);

    const result = await pool.query(
      `SELECT id, "routeId", lat, lng, accuracy, "timestamp", "createdAt"
       FROM "RouteWaypoint"
       WHERE "routeId" = $1
       ORDER BY "timestamp" ASC, "createdAt" ASC`,
      [routeId]
    );

    const waypoints = result.rows.map((wp: Record<string, unknown>) => ({
      id: wp.id,
      routeId: wp.routeId,
      lat: Number(wp.lat),
      lng: Number(wp.lng),
      accuracy: wp.accuracy != null ? Number(wp.accuracy) : null,
      timestamp: wp.timestamp instanceof Date ? wp.timestamp.toISOString() : wp.timestamp,
      createdAt: wp.createdAt instanceof Date ? (wp.createdAt as Date).toISOString() : wp.createdAt,
    }));

    return NextResponse.json({ routeId, waypoints, count: waypoints.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching waypoints:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
