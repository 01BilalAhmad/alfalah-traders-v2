import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/route-sessions/active?orderbookerId=xxx
// Get the active route session for an orderbooker with associated shop visits
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');

    if (!orderbookerId) {
      return NextResponse.json({ error: 'orderbookerId is required' }, { status: 400 });
    }

    const pool = getPool();

    // Find active session for this orderbooker
    const sessionRes = await pool.query(
      `SELECT * FROM "RouteSession"
       WHERE "orderbookerId" = $1 AND status = 'active'
       ORDER BY "startTime" DESC
       LIMIT 1`,
      [orderbookerId]
    );

    if (sessionRes.rows.length === 0) {
      return NextResponse.json({ session: null, shopVisits: [] });
    }

    const session = sessionRes.rows[0];

    // Get associated shop visits
    const visitsRes = await pool.query(
      `SELECT rsv.*, s.name AS "shopName"
       FROM "RouteShopVisit" rsv
       LEFT JOIN "Shop" s ON rsv."shopId" = s.id
       WHERE rsv."sessionId" = $1
       ORDER BY rsv."enterTime" ASC`,
      [session.id]
    );

    const shopVisits = visitsRes.rows.map((v: Record<string, unknown>) => ({
      id: v.id,
      sessionId: v.sessionId,
      shopId: v.shopId,
      shopName: v.shopName,
      orderbookerId: v.orderbookerId,
      enterLat: v.enterLat,
      enterLng: v.enterLng,
      exitLat: v.exitLat,
      exitLng: v.exitLng,
      enterTime: v.enterTime instanceof Date ? (v.enterTime as Date).toISOString() : v.enterTime,
      exitTime: v.exitTime instanceof Date ? (v.exitTime as Date).toISOString() : v.exitTime,
      timeSpent: v.timeSpent,
      distanceToShop: v.distanceToShop != null ? Number(v.distanceToShop) : null,
      isAutoDetected: v.isAutoDetected,
      createdAt: v.createdAt instanceof Date ? (v.createdAt as Date).toISOString() : v.createdAt,
    }));

    return NextResponse.json({
      session: {
        id: session.id,
        orderbookerId: session.orderbookerId,
        startTime: session.startTime instanceof Date ? session.startTime.toISOString() : session.startTime,
        endTime: session.endTime instanceof Date ? session.endTime.toISOString() : session.endTime,
        startLat: session.startLat,
        startLng: session.startLng,
        startAddress: session.startAddress,
        endLat: session.endLat,
        endLng: session.endLng,
        endAddress: session.endAddress,
        totalDistance: Number(session.totalDistance),
        totalDuration: session.totalDuration,
        status: session.status,
        autoEndReason: session.autoEndReason,
        createdAt: session.createdAt instanceof Date ? session.createdAt.toISOString() : session.createdAt,
        updatedAt: session.updatedAt instanceof Date ? session.updatedAt.toISOString() : session.updatedAt,
      },
      shopVisits,
    });
  } catch (error) {
    console.error('Error fetching active route session:', error);
    return NextResponse.json({ error: 'Failed to fetch active route session' }, { status: 500 });
  }
}
