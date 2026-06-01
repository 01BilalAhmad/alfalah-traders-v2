import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/pg';

// PUT /api/route-tracking/stop-checkout
// Check out from a shop
export async function PUT(request: NextRequest) {
  try {
    const { stopId, recoveryAmount } = await request.json();

    if (!stopId) {
      return NextResponse.json(
        { error: 'stopId is required' },
        { status: 400 }
      );
    }

    // Fetch the existing stop
    const existingRes = await query(
      `SELECT rs.*, s.name AS "shopName"
       FROM "RouteStop" rs
       LEFT JOIN "Shop" s ON rs."shopId" = s.id
       WHERE rs.id = $1`,
      [stopId]
    );

    if (existingRes.rows.length === 0) {
      return NextResponse.json({ error: 'Stop not found' }, { status: 404 });
    }

    const existingStop = existingRes.rows[0];

    if (existingStop.departureTime) {
      return NextResponse.json(
        { error: 'Stop already has a checkout recorded' },
        { status: 400 }
      );
    }

    // Update the stop: set departure time, calculate time spent, set recovery amount
    const result = await query(
      `UPDATE "RouteStop"
       SET "departureTime" = NOW(),
           "timeSpent" = EXTRACT(EPOCH FROM (NOW() - "arrivalTime"))::INTEGER,
           "recoveryAmount" = $1,
           "updatedAt" = NOW()
       WHERE id = $2
       RETURNING *`,
      [recoveryAmount != null ? recoveryAmount : null, stopId]
    );

    const stop = result.rows[0];

    return NextResponse.json({
      id: stop.id,
      routeId: stop.routeId,
      shopId: stop.shopId,
      shopName: existingStop.shopName,
      lat: stop.lat != null ? Number(stop.lat) : null,
      lng: stop.lng != null ? Number(stop.lng) : null,
      arrivalTime: stop.arrivalTime instanceof Date ? stop.arrivalTime.toISOString() : stop.arrivalTime,
      departureTime: stop.departureTime instanceof Date ? stop.departureTime.toISOString() : stop.departureTime,
      timeSpent: stop.timeSpent,
      recoveryAmount: stop.recoveryAmount != null ? Number(stop.recoveryAmount) : null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error checking out from shop:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
