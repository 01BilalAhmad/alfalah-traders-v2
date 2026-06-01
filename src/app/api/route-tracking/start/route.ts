import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/pg';
import crypto from 'crypto';

// POST /api/route-tracking/start
// Start a new route tracking session
export async function POST(request: NextRequest) {
  try {
    const { orderbookerId, companyId, lat, lng } = await request.json();

    if (!orderbookerId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'orderbookerId, lat, and lng are required' },
        { status: 400 }
      );
    }

    // Check if the orderbooker already has an ongoing route
    const existingRes = await query(
      `SELECT id FROM "RouteTracking" WHERE "orderbookerId" = $1 AND status = 'ongoing'`,
      [orderbookerId]
    );

    if (existingRes.rows.length > 0) {
      return NextResponse.json(
        { error: 'Orderbooker already has an ongoing route', ongoingRouteId: existingRes.rows[0].id },
        { status: 409 }
      );
    }

    const routeId = `rt_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;

    // Try INSERT with routeDate column first; if column doesn't exist, fall back to without it
    let result;
    try {
      result = await query(
        `INSERT INTO "RouteTracking" (id, "orderbookerId", "companyId", status, "startLat", "startLng", "startTime", "routeDate", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), CURRENT_DATE, NOW(), NOW())
         RETURNING *`,
        [routeId, orderbookerId, companyId || null, 'ongoing', lat, lng]
      );
    } catch (insertError: unknown) {
      const insertMsg = insertError instanceof Error ? insertError.message : '';
      // If routeDate column doesn't exist, try without it
      if (insertMsg.includes('routeDate') || insertMsg.includes('column') || insertMsg.includes('does not exist')) {
        console.warn('[RouteTracking] routeDate column not found, inserting without it. Will be added by create-tables endpoint.');
        result = await query(
          `INSERT INTO "RouteTracking" (id, "orderbookerId", "companyId", status, "startLat", "startLng", "startTime", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
           RETURNING *`,
          [routeId, orderbookerId, companyId || null, 'ongoing', lat, lng]
        );
      } else {
        throw insertError; // re-throw if it's a different error
      }
    }

    const route = result.rows[0];

    return NextResponse.json({
      id: route.id,
      orderbookerId: route.orderbookerId,
      companyId: route.companyId,
      status: route.status,
      startLat: Number(route.startLat),
      startLng: Number(route.startLng),
      startTime: route.startTime instanceof Date ? route.startTime.toISOString() : route.startTime,
      createdAt: route.createdAt instanceof Date ? route.createdAt.toISOString() : route.createdAt,
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error starting route tracking:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
