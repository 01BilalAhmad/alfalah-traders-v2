import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// Helper: Haversine distance between two lat/lng points (meters)
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// PUT /api/route-tracking/end - End a route
export async function PUT(request: NextRequest) {
  try {
    const { routeId, lat, lng } = await request.json();

    if (!routeId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'routeId, lat, and lng are required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Find the route
    const routeRes = await pool.query(
      `SELECT id, status, "startLat", "startLng", "startTime" FROM "RouteTracking" WHERE id = $1`,
      [routeId]
    );

    if (routeRes.rows.length === 0) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const route = routeRes.rows[0];

    if (route.status === 'completed') {
      return NextResponse.json({ error: 'Route already completed' }, { status: 400 });
    }

    // Ensure createdAt column exists on RouteWaypoint (for ORDER BY)
    try {
      await pool.query(`ALTER TABLE "RouteWaypoint" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    } catch { /* ignore */ }

    // Calculate total distance from waypoints (gracefully handle if table doesn't exist)
    let wpRes = { rows: [] as Array<{ lat: number; lng: number }> };
    try {
      wpRes = await pool.query(
        `SELECT lat, lng FROM "RouteWaypoint" WHERE "routeId" = $1 ORDER BY "timestamp" ASC`,
        [routeId]
      );
    } catch {
      console.warn('[RouteTracking/End] Could not fetch waypoints, using straight-line distance');
    }

    let totalDistanceMeters = 0;
    const allPoints: { lat: number; lng: number }[] = [];

    // Add start point
    if (route.startLat != null && route.startLng != null) {
      allPoints.push({ lat: Number(route.startLat), lng: Number(route.startLng) });
    }

    // Add all waypoints
    for (const wp of wpRes.rows) {
      allPoints.push({ lat: Number(wp.lat), lng: Number(wp.lng) });
    }

    // Add end point
    allPoints.push({ lat: Number(lat), lng: Number(lng) });

    // Calculate total distance through all points
    for (let i = 1; i < allPoints.length; i++) {
      totalDistanceMeters += haversine(
        allPoints[i - 1].lat, allPoints[i - 1].lng,
        allPoints[i].lat, allPoints[i].lng
      );
    }

    // If no waypoints, use straight-line distance
    if (wpRes.rows.length === 0 && route.startLat != null) {
      totalDistanceMeters = haversine(Number(route.startLat), Number(route.startLng), Number(lat), Number(lng));
    }

    const totalDistanceKm = Math.round(totalDistanceMeters / 1000 * 100) / 100;

    // Update the route
    const result = await pool.query(
      `UPDATE "RouteTracking"
       SET "endLat" = $1,
           "endLng" = $2,
           "endTime" = NOW(),
           "totalDuration" = EXTRACT(EPOCH FROM (NOW() - "startTime"))::INTEGER,
           "totalDistance" = $3,
           status = 'completed',
           "updatedAt" = NOW()
       WHERE id = $4
       RETURNING *`,
      [lat, lng, totalDistanceKm, routeId]
    );

    const updatedRoute = result.rows[0];

    // Fetch stops with shop details (gracefully handle if table doesn't exist)
    let stopsRes = { rows: [] as Record<string, unknown>[] };
    try {
      stopsRes = await pool.query(
        `SELECT rs.id, rs."shopId", rs.lat, rs.lng, rs."arrivalTime", rs."departureTime", rs."timeSpent", rs."recoveryAmount",
                s.name AS "shopName", s.area AS "shopArea"
         FROM "RouteStop" rs
         LEFT JOIN "Shop" s ON rs."shopId" = s.id
         WHERE rs."routeId" = $1
         ORDER BY rs."arrivalTime" ASC`,
        [routeId]
      );
    } catch {
      console.warn('[RouteTracking/End] Could not fetch stops');
    }

    return NextResponse.json({
      route: {
        id: updatedRoute.id,
        orderbookerId: updatedRoute.orderbookerId,
        companyId: updatedRoute.companyId,
        status: updatedRoute.status,
        startLat: Number(updatedRoute.startLat),
        startLng: Number(updatedRoute.startLng),
        endLat: Number(updatedRoute.endLat),
        endLng: Number(updatedRoute.endLng),
        startTime: updatedRoute.startTime instanceof Date ? updatedRoute.startTime.toISOString() : updatedRoute.startTime,
        endTime: updatedRoute.endTime instanceof Date ? updatedRoute.endTime.toISOString() : updatedRoute.endTime,
        totalDistance: totalDistanceKm,
        totalDuration: updatedRoute.totalDuration,
        waypointsCount: wpRes.rows.length,
        stopsCount: stopsRes.rows.length,
      },
      stops: stopsRes.rows.map((s: Record<string, unknown>) => ({
        id: s.id,
        shopId: s.shopId,
        shopName: s.shopName || 'Unknown',
        shopArea: s.shopArea,
        lat: s.lat != null ? Number(s.lat) : null,
        lng: s.lng != null ? Number(s.lng) : null,
        arrivalTime: s.arrivalTime instanceof Date ? s.arrivalTime.toISOString() : s.arrivalTime,
        departureTime: s.departureTime instanceof Date ? (s.departureTime as Date).toISOString() : s.departureTime,
        timeSpent: s.timeSpent,
        recoveryAmount: s.recoveryAmount != null ? Number(s.recoveryAmount) : null,
      })),
    });
  } catch (error) {
    console.error('[RouteTracking/End] Error:', error);
    return NextResponse.json(
      { error: `Failed to end route: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
