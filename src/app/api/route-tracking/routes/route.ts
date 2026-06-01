import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

// GET /api/route-tracking/routes - List routes with filtering
// Query params: orderbookerId?, date?, companyId?, status?, limit?, offset?
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const date = searchParams.get('date'); // YYYY-MM-DD
    const companyId = searchParams.get('companyId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: any = {};

    if (orderbookerId) {
      where.orderbookerId = orderbookerId;
    }

    if (companyId) {
      where.companyId = companyId;
    }

    if (status) {
      where.status = status;
    }

    if (date) {
      // Parse date and create range for that day
      const [year, month, day] = date.split('-').map(Number);
      const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
      where.routeDate = {
        gte: startDate,
        lte: endDate,
      };
    }

    const [routes, total] = await Promise.all([
      db.routeTracking.findMany({
        where,
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
        orderBy: { routeDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.routeTracking.count({ where }),
    ]);

    // Format routes for consistent output
    const formattedRoutes = routes.map((route) => ({
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
      stops: route.stops.map((stop) => ({
        id: stop.id,
        shopId: stop.shopId,
        shop: stop.shop,
        arrivalTime: stop.arrivalTime instanceof Date ? stop.arrivalTime.toISOString() : stop.arrivalTime,
        departureTime: stop.departureTime instanceof Date ? stop.departureTime.toISOString() : stop.departureTime,
        timeSpent: stop.timeSpent,
        lat: stop.lat,
        lng: stop.lng,
        recoveryAmount: stop.recoveryAmount,
      })),
    }));

    return NextResponse.json({
      routes: formattedRoutes,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching routes:', error);
    return NextResponse.json(
      { error: `Failed to fetch routes: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
