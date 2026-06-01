import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/pg';

// POST /api/route-tracking/stop
// End a route tracking session
export async function POST(request: NextRequest) {
  try {
    const { routeId, lat, lng } = await request.json();

    if (!routeId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'routeId, lat, and lng are required' },
        { status: 400 }
      );
    }

    // Fetch the existing route
    const existingRes = await query(
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

    // Update the route: set end coordinates, end time, status, and calculate total duration
    const result = await query(
      `UPDATE "RouteTracking"
       SET "endLat" = $1,
           "endLng" = $2,
           "endTime" = NOW(),
           status = 'completed',
           "totalDuration" = EXTRACT(EPOCH FROM (NOW() - "startTime"))::INTEGER,
           "updatedAt" = NOW()
       WHERE id = $3
       RETURNING *`,
      [lat, lng, routeId]
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
      totalDuration: route.totalDuration,
      updatedAt: route.updatedAt instanceof Date ? route.updatedAt.toISOString() : route.updatedAt,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error stopping route tracking:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
