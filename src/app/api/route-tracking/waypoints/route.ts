import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import crypto from 'crypto';

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

    // Verify the route exists
    const pool = getPool();
    const routeRes = await pool.query(
      `SELECT id, status FROM "RouteTracking" WHERE id = $1`,
      [routeId]
    );

    if (routeRes.rows.length === 0) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    // Build batch insert query
    // Each waypoint: { lat, lng, accuracy?, timestamp? }
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
