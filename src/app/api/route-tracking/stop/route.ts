import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// Helper: Haversine distance between two lat/lng points (meters)
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
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

// POST /api/route-tracking/stop
// End a route tracking session and calculate total distance from waypoints
export async function POST(request: NextRequest) {
  try {
    const { routeId, lat, lng } = await request.json();

    if (!routeId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'routeId, lat, and lng are required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Fetch the existing route
    const existingRes = await pool.query(
      `SELECT * FROM "RouteTracking" WHERE id = $1`,
      [routeId]
    );

    if (existingRes.rows.length === 0) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const existingRoute = existingRes.rows[0];

    if (existingRoute.status !== 'ongoing') {
      return NextResponse.json(
        { error: `Route is already ${existingRoute.status}` },
        { status: 400 }
      );
    }

    // Calculate total distance from all waypoints
    const wpRes = await pool.query(
      `SELECT lat, lng FROM "RouteWaypoint" WHERE "routeId" = $1 ORDER BY "timestamp" ASC, "createdAt" ASC`,
      [routeId]
    );

    let totalDistanceMeters = 0;
    const allPoints: { lat: number; lng: number }[] = [];

    // Add start point
    if (existingRoute.startLat != null && existingRoute.startLng != null) {
      allPoints.push({ lat: Number(existingRoute.startLat), lng: Number(existingRoute.startLng) });
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
    if (wpRes.rows.length === 0 && existingRoute.startLat != null) {
      totalDistanceMeters = haversine(Number(existingRoute.startLat), Number(existingRoute.startLng), Number(lat), Number(lng));
    }

    const totalDistanceKm = Math.round(totalDistanceMeters / 1000 * 100) / 100;

    // Update the route: set end coordinates, end time, total duration, total distance, status
    const result = await pool.query(
      `UPDATE "RouteTracking"
       SET "endLat" = $1,
           "endLng" = $2,
           "endTime" = NOW(),
           status = 'completed',
           "totalDuration" = EXTRACT(EPOCH FROM (NOW() - "startTime"))::INTEGER,
           "totalDistance" = $3,
           "updatedAt" = NOW()
       WHERE id = $4
       RETURNING *`,
      [lat, lng, totalDistanceKm, routeId]
    );

    const route = result.rows[0];

    return NextResponse.json({
      id: route.id,
      orderbookerId: route.orderbookerId,
      companyId: route.companyId,
      status: route.status,
      startLat: Number(route.startLat),
      startLng: Number(route.startLng),
      endLat: Number(route.endLat),
      endLng: Number(route.endLng),
      startTime: route.startTime instanceof Date ? route.startTime.toISOString() : route.startTime,
      endTime: route.endTime instanceof Date ? route.endTime.toISOString() : route.endTime,
      totalDistance: totalDistanceKm,
      totalDuration: route.totalDuration,
      waypointsCount: wpRes.rows.length,
      updatedAt: route.updatedAt instanceof Date ? route.updatedAt.toISOString() : route.updatedAt,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error stopping route tracking:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
