import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/route-sessions/live
// Admin live polling endpoint — returns ALL active sessions with latest location + shop visits.
// Designed for 5-second polling from admin dashboard.
// Returns { sessions: [{ id, orderbookerId, orderbookerName, startTime, currentLocation, locations, shopVisits }] }
export async function GET() {
  try {
    const pool = getPool();

    // Fetch all active sessions with orderbooker info
    const sessionsRes = await pool.query(
      `SELECT rs.id, rs."orderbookerId", rs."startTime", rs."startLat", rs."startLng",
              rs."startAddress", rs."totalDistance", rs."totalDuration",
              rs.status, rs."createdAt", rs."updatedAt",
              u.name AS "orderbookerName"
       FROM "RouteSession" rs
       INNER JOIN "User" u ON rs."orderbookerId" = u.id
       WHERE rs.status = 'active'
       ORDER BY rs."startTime" DESC`
    );

    if (sessionsRes.rows.length === 0) {
      return NextResponse.json({ sessions: [] });
    }

    const sessionIds = sessionsRes.rows.map((r: any) => r.id);

    // Fetch last 100 locations per session
    const locationsRes = await pool.query(
      `SELECT rl.*
       FROM "RouteLocation" rl
       WHERE rl."sessionId" = ANY($1)
         AND rl.id IN (
           SELECT rl2.id FROM "RouteLocation" rl2
           WHERE rl2."sessionId" = rl."sessionId"
           ORDER BY rl2."recordedAt" DESC
           LIMIT 100
         )
       ORDER BY rl."recordedAt" ASC`,
      [sessionIds]
    );

    // Fetch shop visits with shop names for all active sessions
    const visitsRes = await pool.query(
      `SELECT rsv.*, s.name AS "shopName"
       FROM "RouteShopVisit" rsv
       LEFT JOIN "Shop" s ON rsv."shopId" = s.id
       WHERE rsv."sessionId" = ANY($1)
       ORDER BY rsv."enterTime" ASC`,
      [sessionIds]
    );

    // Group locations and visits by sessionId
    const locationsBySession: Record<string, any[]> = {};
    for (const loc of locationsRes.rows) {
      const sid = loc.sessionId;
      if (!locationsBySession[sid]) locationsBySession[sid] = [];
      locationsBySession[sid].push(serializeLocation(loc));
    }

    const visitsBySession: Record<string, any[]> = {};
    for (const visit of visitsRes.rows) {
      const sid = visit.sessionId;
      if (!visitsBySession[sid]) visitsBySession[sid] = [];
      visitsBySession[sid].push(serializeShopVisit(visit));
    }

    // Build the response
    const sessions = sessionsRes.rows.map((row: any) => {
      const locations = locationsBySession[row.id] || [];
      const currentLocation = locations.length > 0 ? locations[locations.length - 1] : null;

      return {
        id: row.id,
        orderbookerId: row.orderbookerId,
        orderbookerName: row.orderbookerName,
        startTime: row.startTime instanceof Date ? row.startTime.toISOString() : row.startTime,
        startLat: row.startLat != null ? Number(row.startLat) : null,
        startLng: row.startLng != null ? Number(row.startLng) : null,
        startAddress: row.startAddress ?? null,
        totalDistance: Number(row.totalDistance),
        totalDuration: Number(row.totalDuration),
        status: row.status,
        currentLocation,
        locations,
        shopVisits: visitsBySession[row.id] || [],
      };
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Error fetching live sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch live sessions' },
      { status: 500 }
    );
  }
}

function serializeLocation(row: any) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    lat: Number(row.lat),
    lng: Number(row.lng),
    accuracy: row.accuracy != null ? Number(row.accuracy) : null,
    speed: row.speed != null ? Number(row.speed) : null,
    altitude: row.altitude != null ? Number(row.altitude) : null,
    batteryLevel: row.batteryLevel != null ? Number(row.batteryLevel) : null,
    isOffline: row.isOffline,
    recordedAt: row.recordedAt instanceof Date ? row.recordedAt.toISOString() : row.recordedAt,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
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
