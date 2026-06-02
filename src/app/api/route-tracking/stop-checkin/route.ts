import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/pg';
import crypto from 'crypto';

// POST /api/route-tracking/stop-checkin
// Check in at a shop during route
export async function POST(request: NextRequest) {
  try {
    const { routeId, shopId, lat, lng, entryType } = await request.json();

    if (!routeId || !shopId) {
      return NextResponse.json(
        { error: 'routeId and shopId are required' },
        { status: 400 }
      );
    }

    // Verify the route exists and is ongoing
    const routeRes = await query(
      `SELECT id, status FROM "RouteTracking" WHERE id = $1`,
      [routeId]
    );

    if (routeRes.rows.length === 0) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    if (routeRes.rows[0].status !== 'ongoing') {
      return NextResponse.json(
        { error: `Cannot check in to a ${routeRes.rows[0].status} route` },
        { status: 400 }
      );
    }

    // Verify the shop exists
    const shopRes = await query(
      `SELECT id, name FROM "Shop" WHERE id = $1`,
      [shopId]
    );

    if (shopRes.rows.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const stopId = `rs_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;

    const result = await query(
      `INSERT INTO "RouteStop" (id, "routeId", "shopId", lat, lng, "arrivalTime", "entryType", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW(), NOW())
       RETURNING *`,
      [stopId, routeId, shopId, lat ?? null, lng ?? null, entryType || 'field_visit']
    );

    const stop = result.rows[0];

    return NextResponse.json({
      id: stop.id,
      routeId: stop.routeId,
      shopId: stop.shopId,
      shopName: shopRes.rows[0].name,
      lat: stop.lat != null ? Number(stop.lat) : null,
      lng: stop.lng != null ? Number(stop.lng) : null,
      arrivalTime: stop.arrivalTime instanceof Date ? stop.arrivalTime.toISOString() : stop.arrivalTime,
      departureTime: stop.departureTime instanceof Date ? stop.departureTime.toISOString() : stop.departureTime,
      timeSpent: stop.timeSpent,
      recoveryAmount: stop.recoveryAmount != null ? Number(stop.recoveryAmount) : null,
      entryType: stop.entryType || 'field_visit',
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error checking in at shop:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
