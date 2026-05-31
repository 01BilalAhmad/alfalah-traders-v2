import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

// GET /api/route-tracking/routes/[id] - Single route detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { id } = await params;

    const route = await db.routeTracking.findUnique({
      where: { id },
      include: {
        orderbooker: {
          select: {
            id: true,
            name: true,
            username: true,
            phone: true,
          },
        },
        company: { select: { id: true, name: true } },
        stops: {
          include: {
            shop: {
              select: {
                id: true,
                name: true,
                area: true,
                address: true,
                phone: true,
              },
            },
          },
          orderBy: { arrivalTime: 'asc' },
        },
      },
    });

    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    // Format route for detailed view / map visualization
    const formattedRoute = {
      id: route.id,
      orderbookerId: route.orderbookerId,
      orderbooker: route.orderbooker,
      companyId: route.companyId,
      company: route.company,
      routeDate: route.routeDate instanceof Date ? route.routeDate.toISOString() : route.routeDate,
      startLat: route.startLat,
      startLng: route.startLng,
      startTime: route.startTime instanceof Date ? route.startTime.toISOString() : route.startTime,
      endLat: route.endLat,
      endLng: route.endLng,
      endTime: route.endTime instanceof Date ? route.endTime.toISOString() : route.endTime,
      totalDistance: route.totalDistance,
      status: route.status,
      createdAt: route.createdAt instanceof Date ? route.createdAt.toISOString() : route.createdAt,
      updatedAt: route.updatedAt instanceof Date ? route.updatedAt.toISOString() : route.updatedAt,
      stopsCount: route.stops.length,
      stops: route.stops.map((stop, index) => ({
        id: stop.id,
        sequenceNumber: index + 1,
        shopId: stop.shopId,
        shop: stop.shop,
        arrivalTime: stop.arrivalTime instanceof Date ? stop.arrivalTime.toISOString() : stop.arrivalTime,
        departureTime: stop.departureTime instanceof Date ? stop.departureTime.toISOString() : stop.departureTime,
        timeSpent: stop.timeSpent,
        lat: stop.lat,
        lng: stop.lng,
        recoveryAmount: stop.recoveryAmount,
      })),
      // Build path coordinates for map visualization
      pathCoordinates: [
        { lat: route.startLat, lng: route.startLng, type: 'start' },
        ...route.stops.map((stop, index) => ({
          lat: stop.lat,
          lng: stop.lng,
          type: 'stop' as const,
          stopIndex: index + 1,
          shopName: stop.shop.name,
        })),
        ...(route.endLat && route.endLng
          ? [{ lat: route.endLat, lng: route.endLng, type: 'end' as const }]
          : []),
      ],
      // Summary stats
      summary: {
        totalStops: route.stops.length,
        completedStops: route.stops.filter((s) => s.departureTime !== null).length,
        totalTimeSpent: route.stops.reduce((sum, s) => sum + (s.timeSpent || 0), 0),
        totalRecovery: route.stops.reduce((sum, s) => sum + (s.recoveryAmount || 0), 0),
      },
    };

    return NextResponse.json(formattedRoute);
  } catch (error) {
    console.error('Error fetching route detail:', error);
    return NextResponse.json(
      { error: `Failed to fetch route: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
