import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';
import { areRouteTrackingTablesReady } from '@/lib/route-tracking-helpers';

// POST /api/route-tracking/checkin - Check into a shop
export async function POST(request: NextRequest) {
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

    const { routeId, shopId, lat, lng } = await request.json();

    if (!routeId || !shopId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'routeId, shopId, lat, and lng are required' },
        { status: 400 }
      );
    }

    // Verify the route exists and is ongoing
    const route = await db.routeTracking.findUnique({
      where: { id: routeId },
    });

    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    if (route.status !== 'ongoing') {
      return NextResponse.json({ error: 'Cannot check in to a completed route' }, { status: 400 });
    }

    // Verify the shop exists
    const shop = await db.shop.findUnique({
      where: { id: shopId },
      select: { id: true, name: true, area: true },
    });

    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Check if already checked into this shop on this route (without checkout)
    const existingStop = await db.routeStop.findFirst({
      where: {
        routeId,
        shopId,
        departureTime: null,
      },
    });

    if (existingStop) {
      return NextResponse.json(
        { error: 'Already checked into this shop on this route', stopId: existingStop.id },
        { status: 409 }
      );
    }

    const now = new Date();
    const stop = await db.routeStop.create({
      data: {
        routeId,
        shopId,
        arrivalTime: now,
        lat,
        lng,
      },
      include: {
        shop: { select: { id: true, name: true, area: true } },
        route: {
          select: { id: true, status: true, orderbookerId: true },
        },
      },
    });

    return NextResponse.json({ stop }, { status: 201 });
  } catch (error) {
    console.error('Error checking into shop:', error);
    return NextResponse.json(
      { error: `Failed to check in: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
