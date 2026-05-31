import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

// PUT /api/route-tracking/checkout - Check out of a shop
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { stopId, recoveryAmount } = await request.json();

    if (!stopId) {
      return NextResponse.json({ error: 'stopId is required' }, { status: 400 });
    }

    // Find the stop
    const stop = await db.routeStop.findUnique({
      where: { id: stopId },
      include: {
        route: { select: { id: true, status: true } },
        shop: { select: { id: true, name: true, area: true } },
      },
    });

    if (!stop) {
      return NextResponse.json({ error: 'Stop not found' }, { status: 404 });
    }

    if (stop.departureTime) {
      return NextResponse.json({ error: 'Already checked out of this shop' }, { status: 400 });
    }

    if (stop.route.status !== 'ongoing') {
      return NextResponse.json({ error: 'Cannot check out of a completed route' }, { status: 400 });
    }

    const now = new Date();
    const arrivalTime = new Date(stop.arrivalTime);
    const timeSpent = Math.round((now.getTime() - arrivalTime.getTime()) / (1000 * 60)); // Minutes

    const updatedStop = await db.routeStop.update({
      where: { id: stopId },
      data: {
        departureTime: now,
        timeSpent,
        recoveryAmount: recoveryAmount !== undefined ? recoveryAmount : null,
      },
      include: {
        shop: { select: { id: true, name: true, area: true } },
        route: {
          select: { id: true, status: true, orderbookerId: true },
        },
      },
    });

    return NextResponse.json(updatedStop);
  } catch (error) {
    console.error('Error checking out of shop:', error);
    return NextResponse.json(
      { error: `Failed to check out: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
