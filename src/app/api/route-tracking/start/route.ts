import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

// POST /api/route-tracking/start - Start a new route
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { orderbookerId, companyId, lat, lng } = await request.json();

    if (!orderbookerId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'orderbookerId, lat, and lng are required' },
        { status: 400 }
      );
    }

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
      return NextResponse.json(
        { error: 'Orderbooker already has an ongoing route', ongoingRouteId: ongoingRoute.id },
        { status: 409 }
      );
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

    return NextResponse.json(route, { status: 201 });
  } catch (error) {
    console.error('Error starting route:', error);
    return NextResponse.json(
      { error: `Failed to start route: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
