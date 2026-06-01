import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';
import { areRouteTrackingTablesReady } from '@/lib/route-tracking-helpers';

// GET /api/route-tracking/summary - Dashboard summary
// Query params: orderbookerId?, from?, to?
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    // Check if tables exist - return empty summary if not
    let tablesReady = false;
    try {
      tablesReady = await areRouteTrackingTablesReady();
    } catch {
      // BUG FIX: If table check itself fails, return empty summary instead of 500
      console.warn('[RouteTracking/Summary] Failed to check tables, returning empty summary');
      return NextResponse.json({
        summary: {
          totalRoutes: 0,
          completedRoutes: 0,
          ongoingRoutes: 0,
          totalShopsVisited: 0,
          totalDistance: 0,
          avgTimePerShop: 0,
          totalRecovery: 0,
        },
        byOrderbooker: [],
        setupNeeded: true,
      });
    }
    if (!tablesReady) {
      return NextResponse.json({
        summary: {
          totalRoutes: 0,
          completedRoutes: 0,
          ongoingRoutes: 0,
          totalShopsVisited: 0,
          totalDistance: 0,
          avgTimePerShop: 0,
          totalRecovery: 0,
        },
        byOrderbooker: [],
        setupNeeded: true,
      });
    }

    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const from = searchParams.get('from'); // YYYY-MM-DD
    const to = searchParams.get('to'); // YYYY-MM-DD

    // Build route where clause
    const routeWhere: any = {};

    if (orderbookerId) {
      routeWhere.orderbookerId = orderbookerId;
    }

    // Date range filter
    // BUG FIX: Use Pakistan timezone (UTC+5) for date filtering
    if (from || to) {
      routeWhere.routeDate = {};
      if (from) {
        const [y, m, d] = from.split('-').map(Number);
        const startDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
        startDate.setUTCHours(startDate.getUTCHours() - 5); // Pakistan UTC+5
        routeWhere.routeDate.gte = startDate;
      }
      if (to) {
        const [y, m, d] = to.split('-').map(Number);
        const endDate = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
        endDate.setUTCHours(endDate.getUTCHours() + 5); // Pakistan UTC+5
        routeWhere.routeDate.lte = endDate;
      }
    }

    // Fetch routes with stops for summary calculation
    const routes = await db.routeTracking.findMany({
      where: routeWhere,
      include: {
        orderbooker: { select: { id: true, name: true, username: true } },
        stops: true,
      },
      orderBy: { routeDate: 'desc' },
    });

    // Calculate overall summary
    const totalRoutes = routes.length;
    const completedRoutes = routes.filter((r) => r.status === 'completed').length;
    const ongoingRoutes = routes.filter((r) => r.status === 'ongoing').length;
    const totalShopsVisited = routes.reduce((sum, r) => sum + r.stops.length, 0);
    const totalDistance = routes.reduce((sum, r) => sum + (r.totalDistance || 0), 0);

    // Calculate average time per shop (only from stops with departureTime)
    const stopsWithTime = routes.flatMap((r) => r.stops).filter((s) => s.timeSpent !== null);
    const avgTimePerShop =
      stopsWithTime.length > 0
        ? Math.round(stopsWithTime.reduce((sum, s) => sum + (s.timeSpent || 0), 0) / stopsWithTime.length)
        : 0;

    // Total recovery from route stops
    const totalRecovery = routes
      .flatMap((r) => r.stops)
      .reduce((sum, s) => sum + (s.recoveryAmount || 0), 0);

    // Group by orderbooker
    const byOrderbooker: Record<
      string,
      {
        orderbooker: { id: string; name: string; username: string };
        totalRoutes: number;
        completedRoutes: number;
        ongoingRoutes: number;
        totalShopsVisited: number;
        totalDistance: number;
        avgTimePerShop: number;
        totalRecovery: number;
      }
    > = {};

    for (const route of routes) {
      const obId = route.orderbookerId;
      if (!byOrderbooker[obId]) {
        byOrderbooker[obId] = {
          orderbooker: route.orderbooker,
          totalRoutes: 0,
          completedRoutes: 0,
          ongoingRoutes: 0,
          totalShopsVisited: 0,
          totalDistance: 0,
          avgTimePerShop: 0,
          totalRecovery: 0,
        };
      }

      const ob = byOrderbooker[obId];
      ob.totalRoutes += 1;
      if (route.status === 'completed') ob.completedRoutes += 1;
      if (route.status === 'ongoing') ob.ongoingRoutes += 1;
      ob.totalShopsVisited += route.stops.length;
      ob.totalDistance += route.totalDistance || 0;
      ob.totalRecovery += route.stops.reduce((sum, s) => sum + (s.recoveryAmount || 0), 0);
    }

    // Calculate avg time per shop for each orderbooker
    for (const obId of Object.keys(byOrderbooker)) {
      const obStopsWithTime = routes
        .filter((r) => r.orderbookerId === obId)
        .flatMap((r) => r.stops)
        .filter((s) => s.timeSpent !== null);
      byOrderbooker[obId].avgTimePerShop =
        obStopsWithTime.length > 0
          ? Math.round(obStopsWithTime.reduce((sum, s) => sum + (s.timeSpent || 0), 0) / obStopsWithTime.length)
          : 0;
    }

    return NextResponse.json({
      summary: {
        totalRoutes,
        completedRoutes,
        ongoingRoutes,
        totalShopsVisited,
        totalDistance: Math.round(totalDistance * 100) / 100,
        avgTimePerShop,
        totalRecovery: Math.round(totalRecovery * 100) / 100,
      },
      byOrderbooker: Object.values(byOrderbooker),
    });
  } catch (error) {
    console.error('Error fetching route summary:', error);
    // Return empty summary instead of 500 error
    return NextResponse.json({
      summary: {
        totalRoutes: 0,
        completedRoutes: 0,
        ongoingRoutes: 0,
        totalShopsVisited: 0,
        totalDistance: 0,
        avgTimePerShop: 0,
        totalRecovery: 0,
      },
      byOrderbooker: [],
      setupNeeded: true,
      error: `Failed to fetch summary: ${(error as Error)?.message || 'Unknown error'}`,
    });
  }
}
