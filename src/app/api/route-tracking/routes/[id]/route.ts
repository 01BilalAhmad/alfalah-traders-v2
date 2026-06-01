import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/route-tracking/routes/:id
// Get single route detail with all waypoints and stops
// Returns FLATTENED structure matching frontend RouteDetail interface
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routeId } = await params;
    const pool = getPool();

    // Fetch route with orderbooker info
    const routeRes = await pool.query(
      `SELECT rt.*, u.name AS "orderbookerName"
       FROM "RouteTracking" rt
       LEFT JOIN "User" u ON rt."orderbookerId" = u.id
       WHERE rt.id = $1`,
      [routeId]
    );

    if (routeRes.rows.length === 0) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const r = routeRes.rows[0];

    // Fetch ALL waypoints for polyline rendering on map
    // Gracefully handle if RouteWaypoint table doesn't exist yet
    let waypoints: Array<{
      id: string;
      routeId: string;
      lat: number;
      lng: number;
      accuracy: number | null;
      timestamp: string;
    }> = [];

    try {
      const waypointsRes = await pool.query(
        `SELECT id, lat, lng, accuracy, "timestamp"
         FROM "RouteWaypoint"
         WHERE "routeId" = $1
         ORDER BY "timestamp" ASC`,
        [routeId]
      );

      waypoints = waypointsRes.rows.map((wp: Record<string, unknown>) => ({
        id: wp.id as string,
        routeId,
        lat: Number(wp.lat),
        lng: Number(wp.lng),
        accuracy: wp.accuracy != null ? Number(wp.accuracy) : null,
        timestamp: wp.timestamp instanceof Date ? wp.timestamp.toISOString() : (wp.timestamp as string),
      }));
    } catch (wpError: unknown) {
      // RouteWaypoint table might not exist yet — log but don't crash
      const wpMsg = wpError instanceof Error ? wpError.message : '';
      console.warn('[RouteDetail] Could not fetch waypoints:', wpMsg);
    }

    // Fetch stops with shop details
    // Gracefully handle if RouteStop table doesn't exist yet
    let stops: Array<{
      id: string;
      routeId: string;
      shopId: string;
      shopName: string;
      shopArea: string | null;
      shopAddress: string | null;
      shopBalance: number | null;
      lat: number | null;
      lng: number | null;
      arrivalTime: string;
      departureTime: string | null;
      timeSpent: number | null;
      recoveryAmount: number | null;
    }> = [];

    try {
      const stopsRes = await pool.query(
        `SELECT rs.id, rs."routeId", rs."shopId", rs.lat, rs.lng,
                rs."arrivalTime", rs."departureTime", rs."timeSpent", rs."recoveryAmount",
                s.name AS "shopName", s.area AS "shopArea", s.address AS "shopAddress",
                s.balance AS "shopBalance"
         FROM "RouteStop" rs
         LEFT JOIN "Shop" s ON rs."shopId" = s.id
         WHERE rs."routeId" = $1
         ORDER BY rs."arrivalTime" ASC`,
        [routeId]
      );

      stops = stopsRes.rows.map((s: Record<string, unknown>) => ({
        id: s.id as string,
        routeId,
        shopId: s.shopId as string,
        shopName: (s.shopName as string) || 'Unknown',
        shopArea: (s.shopArea as string) || null,
        shopAddress: (s.shopAddress as string) || null,
        shopBalance: s.shopBalance != null ? Number(s.shopBalance) : null,
        lat: s.lat != null ? Number(s.lat) : null,
        lng: s.lng != null ? Number(s.lng) : null,
        arrivalTime: s.arrivalTime instanceof Date ? s.arrivalTime.toISOString() : (s.arrivalTime as string),
        departureTime: s.departureTime instanceof Date ? (s.departureTime as Date).toISOString() : (s.departureTime as string | null),
        timeSpent: s.timeSpent != null ? Number(s.timeSpent) : null,
        recoveryAmount: s.recoveryAmount != null ? Number(s.recoveryAmount) : null,
      }));
    } catch (stopError: unknown) {
      const stopMsg = stopError instanceof Error ? stopError.message : '';
      console.warn('[RouteDetail] Could not fetch stops:', stopMsg);
    }

    // Calculate total distance from: start + waypoints + end (consistent with polyline rendering)
    const allPoints: { lat: number; lng: number }[] = [];

    // Add start point
    if (r.startLat != null && r.startLng != null) {
      allPoints.push({ lat: Number(r.startLat), lng: Number(r.startLng) });
    }

    // Add all waypoints
    for (const wp of waypoints) {
      allPoints.push({ lat: wp.lat, lng: wp.lng });
    }

    // Add end point
    if (r.endLat != null && r.endLng != null) {
      allPoints.push({ lat: Number(r.endLat), lng: Number(r.endLng) });
    }

    // Calculate distance through all points
    let totalDistanceMeters = 0;
    for (let i = 1; i < allPoints.length; i++) {
      totalDistanceMeters += haversine(
        allPoints[i - 1].lat, allPoints[i - 1].lng,
        allPoints[i].lat, allPoints[i].lng
      );
    }

    // If no waypoints and have start/end, use straight-line distance
    if (waypoints.length === 0 && r.startLat != null && r.endLat != null) {
      totalDistanceMeters = haversine(Number(r.startLat), Number(r.startLng), Number(r.endLat), Number(r.endLng));
    }

    // Convert meters to km
    const totalDistanceKm = Math.round(totalDistanceMeters / 1000 * 100) / 100;

    // Calculate total recovery from stops
    const totalRecovery = stops.reduce((sum, s) => {
      return sum + (s.recoveryAmount || 0);
    }, 0);

    // Convert totalDuration from seconds to minutes for frontend display
    const totalDurationMinutes = r.totalDuration != null ? Math.round(Number(r.totalDuration) / 60) : null;

    // FLATTENED response — all route properties at top level + waypoints + stops
    // This matches the RouteDetail interface in AdminRouteTracking.tsx
    return NextResponse.json({
      id: r.id,
      orderbookerId: r.orderbookerId,
      orderbookerName: r.orderbookerName,
      companyId: r.companyId,
      routeDate: r.startTime instanceof Date ? r.startTime.toISOString().split('T')[0] : (r.routeDate || r.startTime?.toString()?.split('T')[0]),
      status: r.status,
      startLat: r.startLat != null ? Number(r.startLat) : null,
      startLng: r.startLng != null ? Number(r.startLng) : null,
      endLat: r.endLat != null ? Number(r.endLat) : null,
      endLng: r.endLng != null ? Number(r.endLng) : null,
      startTime: r.startTime instanceof Date ? r.startTime.toISOString() : r.startTime,
      endTime: r.endTime instanceof Date ? (r.endTime as Date).toISOString() : r.endTime,
      totalDistance: totalDistanceKm,
      totalDuration: totalDurationMinutes,
      stopsCount: stops.length,
      waypointsCount: waypoints.length,
      waypoints,
      stops,
      summary: {
        totalWaypoints: waypoints.length,
        totalStops: stops.length,
        totalRecovery: Math.round(totalRecovery * 100) / 100,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching route detail:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Haversine distance between two lat/lng points (returns meters)
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
