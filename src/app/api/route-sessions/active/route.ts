import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/route-sessions/active
// Get the active session for a specific orderbooker.
// Query: ?orderbookerId=xxx
// Returns { session: RouteSession | null, shopVisits: RouteShopVisit[] }
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');

    if (!orderbookerId) {
      return NextResponse.json(
        { error: 'orderbookerId query parameter is required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Find the active session for this orderbooker
    const sessionRes = await pool.query(
      `SELECT * FROM "RouteSession"
       WHERE "orderbookerId" = $1 AND status = 'active'
       ORDER BY "startTime" DESC
       LIMIT 1`,
      [orderbookerId]
    );

    if (sessionRes.rows.length === 0) {
      return NextResponse.json({
        session: null,
        shopVisits: [],
      });
    }

    const session = sessionRes.rows[0];

    // Fetch shop visits for this session
    const visitsRes = await pool.query(
      `SELECT rsv.*, s.name AS "shopName"
       FROM "RouteShopVisit" rsv
       LEFT JOIN "Shop" s ON rsv."shopId" = s.id
       WHERE rsv."sessionId" = $1
       ORDER BY rsv."enterTime" ASC`,
      [session.id]
    );

    return NextResponse.json({
      session: serializeSession(session),
      shopVisits: visitsRes.rows.map(serializeShopVisit),
    });
  } catch (error) {
    console.error('Error fetching active session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch active session' },
      { status: 500 }
    );
  }
}

function serializeSession(row: any) {
  return {
    id: row.id,
    orderbookerId: row.orderbookerId,
    startTime: row.startTime instanceof Date ? row.startTime.toISOString() : row.startTime,
    endTime: row.endTime instanceof Date ? row.endTime.toISOString() : row.endTime,
    startLat: row.startLat != null ? Number(row.startLat) : null,
    startLng: row.startLng != null ? Number(row.startLng) : null,
    startAddress: row.startAddress ?? null,
    endLat: row.endLat != null ? Number(row.endLat) : null,
    endLng: row.endLng != null ? Number(row.endLng) : null,
    endAddress: row.endAddress ?? null,
    totalDistance: Number(row.totalDistance),
    totalDuration: Number(row.totalDuration),
    status: row.status,
    autoEndReason: row.autoEndReason ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

function serializeShopVisit(row: any) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    shopId: row.shopId,
    shopName: row.shopName ?? null,
    enterLat: row.enterLat != null ? Number(row.enterLat) : null,
    enterLng: row.enterLng != null ? Number(row.enterLng) : null,
    exitLat: row.exitLat != null ? Number(row.exitLat) : null,
    exitLng: row.exitLng != null ? Number(row.exitLng) : null,
    enterTime: row.enterTime instanceof Date ? row.enterTime.toISOString() : row.enterTime,
    exitTime: row.exitTime instanceof Date ? row.exitTime.toISOString() : row.exitTime,
    timeSpent: row.timeSpent != null ? Number(row.timeSpent) : null,
    distanceToShop: row.distanceToShop != null ? Number(row.distanceToShop) : null,
    isAutoDetected: row.isAutoDetected,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}
