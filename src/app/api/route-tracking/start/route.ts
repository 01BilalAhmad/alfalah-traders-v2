import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';
import { areRouteTrackingTablesReady, createRouteTrackingTables, resetTableReadinessCache } from '@/lib/route-tracking-helpers';

// POST /api/route-tracking/start - Start a new route
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      console.warn('[RouteTracking/Start] Auth failed:', auth.error);
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    console.log('[RouteTracking/Start] User authenticated:', auth.userId);

    // Check if tables exist - auto-create if possible
    let tablesReady = await areRouteTrackingTablesReady();
    console.log('[RouteTracking/Start] Tables ready:', tablesReady);

    if (!tablesReady) {
      const result = await createRouteTrackingTables();
      console.log('[RouteTracking/Start] Auto-create tables result:', result);
      if (result.created) {
        resetTableReadinessCache();
        tablesReady = true;
      } else {
        return NextResponse.json(
          { error: 'Route tracking is not set up yet. Please run setup from the admin panel.', setupNeeded: true },
          { status: 503 }
        );
      }
    }

    const { orderbookerId, companyId, lat, lng } = await request.json();

    if (!orderbookerId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'orderbookerId, lat, and lng are required' },
        { status: 400 }
      );
    }

    console.log('[RouteTracking/Start] Starting route for OB:', orderbookerId, 'at:', lat, lng);

    // Verify the orderbooker exists and is active
    const orderbooker = await db.user.findUnique({
      where: { id: orderbookerId },
      select: { id: true, role: true, status: true },
    });

    if (!orderbooker) {
      return NextResponse.json({ error: 'Orderbooker not found' }, { status: 404 });
    }

    if (orderbooker.status === 'inactive') {
      return NextResponse.json({ error: 'Orderbooker is inactive' }, { status: 400 });
    }

    // Check if orderbooker already has an ongoing route
    const ongoingRoute = await db.routeTracking.findFirst({
      where: {
        orderbookerId,
        status: 'ongoing',
      },
    });

    if (ongoingRoute) {
      console.log('[RouteTracking/Start] OB already has ongoing route:', ongoingRoute.id);
      // Instead of returning error, end the existing route first
      await db.routeTracking.update({
        where: { id: ongoingRoute.id },
        data: {
          endLat: lat,
          endLng: lng,
          endTime: new Date(),
          status: 'completed',
          totalDistance: 0,
        },
      });
      console.log('[RouteTracking/Start] Auto-ended previous route:', ongoingRoute.id);
    }

    // Verify company if provided
    if (companyId) {
      const company = await db.company.findUnique({ where: { id: companyId } });
      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
    }

    const now = new Date();
    const route = await db.routeTracking.create({
      data: {
        orderbookerId,
        companyId: companyId || null,
        startLat: lat,
        startLng: lng,
        startTime: now,
        routeDate: now,
        status: 'ongoing',
      },
      include: {
        orderbooker: { select: { id: true, name: true, username: true } },
        company: { select: { id: true, name: true } },
        stops: {
          include: {
            shop: { select: { id: true, name: true, area: true } },
          },
        },
      },
    });

    console.log('[RouteTracking/Start] Route created:', route.id);
    return NextResponse.json({ route }, { status: 201 });
  } catch (error) {
    console.error('[RouteTracking/Start] Error:', error);
    return NextResponse.json(
      { error: `Failed to start route: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
