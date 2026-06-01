import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';
import { areRouteTrackingTablesReady } from '@/lib/route-tracking-helpers';

// Helper: Haversine distance between two lat/lng points (km)
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// PUT /api/route-tracking/end - End a route
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    // Check if tables exist
    const tablesReady = await areRouteTrackingTablesReady();
    if (!tablesReady) {
      return NextResponse.json(
        { error: 'Route tracking is not set up yet', setupNeeded: true },
        { status: 503 }
      );
    }

    const { routeId, lat, lng } = await request.json();

    if (!routeId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'routeId, lat, and lng are required' },
        { status: 400 }
      );
    }

    // Find the route
    const route = await db.routeTracking.findUnique({
      where: { id: routeId },
      include: {
        stops: {
          orderBy: { arrivalTime: 'asc' },
        },
      },
    });

    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    if (route.status === 'completed') {
      return NextResponse.json({ error: 'Route is already completed' }, { status: 400 });
    }

    // Calculate total distance
    let totalDistance = 0;
    const stops = route.stops;

    if (stops.length > 0) {
      totalDistance += haversineDistance(route.startLat, route.startLng, stops[0].lat, stops[0].lng);
      for (let i = 1; i < stops.length; i++) {
        totalDistance += haversineDistance(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng);
      }
      totalDistance += haversineDistance(stops[stops.length - 1].lat, stops[stops.length - 1].lng, lat, lng);
    } else {
      totalDistance = haversineDistance(route.startLat, route.startLng, lat, lng);
    }

    const now = new Date();
    const updatedRoute = await db.routeTracking.update({
      where: { id: routeId },
      data: {
        endLat: lat,
        endLng: lng,
        endTime: now,
        totalDistance: Math.round(totalDistance * 100) / 100,
        status: 'completed',
      },
      include: {
        orderbooker: { select: { id: true, name: true, username: true } },
        company: { select: { id: true, name: true } },
        stops: {
          include: {
            shop: { select: { id: true, name: true, area: true } },
          },
          orderBy: { arrivalTime: 'asc' },
        },
      },
    });

    return NextResponse.json({ route: updatedRoute });
  } catch (error) {
    console.error('Error ending route:', error);
    return NextResponse.json(
      { error: `Failed to end route: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
