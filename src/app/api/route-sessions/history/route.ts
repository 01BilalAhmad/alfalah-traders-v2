import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/route-sessions/history
// Historical sessions with date filtering.
// Query: ?orderbookerId=xxx&date=YYYY-MM-DD&limit=50
// Returns sessions with locations (capped at 500/session) + shop visits
// Returns { sessions: [...], total }
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const dateStr = searchParams.get('date'); // YYYY-MM-DD
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    // Pakistan timezone offset (UTC+5)
    const pkOffset = 5 * 60;

    let startDate: Date;
    let endDate: Date;

    if (dateStr) {
      const [year, month, day] = dateStr.split('-').map(Number);
      startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - pkOffset * 60 * 1000);
      endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - pkOffset * 60 * 1000);
    } else {
      // Default: today in Pakistan timezone
      const now = new Date();
      const pkNow = new Date(now.getTime() + pkOffset * 60 * 1000);
      const year = pkNow.getUTCFullYear();
      const month = pkNow.getUTCMonth();
      const day = pkNow.getUTCDate();
      startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - pkOffset * 60 * 1000);
      endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - pkOffset * 60 * 1000);
    }

    const pool = getPool();

    // Build query conditions
    const conditions: string[] = [
      `rs."startTime" >= $1`,
      `rs."startTime" <= $2`,
    ];
    const params: any[] = [startDate.toISOString(), endDate.toISOString()];
    let paramIdx = 3;

    if (orderbookerId) {
      conditions.push(`rs."orderbookerId" = $${paramIdx++}`);
      params.push(orderbookerId);
    }

    // Only show ended sessions in history
    conditions.push(`rs.status IN ('ended', 'auto_ended')`);

    // Count total matching sessions
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM "RouteSession" rs
       WHERE ${conditions.join(' AND ')}`,
      params
    );
    const total = countRes.rows[0]?.total || 0;

    // Fetch sessions with orderbooker info
    const sessionsRes = await pool.query(
      `SELECT rs.*, u.name AS "orderbookerName"
       FROM "RouteSession" rs
       INNER JOIN "User" u ON rs."orderbookerId" = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY rs."startTime" DESC
       LIMIT $${paramIdx++}`,
      [...params, limit]
    );

    if (sessionsRes.rows.length === 0) {
      return NextResponse.json({ sessions: [], total: 0 });
    }

    const sessionIds = sessionsRes.rows.map((r: any) => r.id);

    // Fetch locations capped at 500 per session
    const locationsRes = await pool.query(
      `SELECT rl.*
       FROM "RouteLocation" rl
       WHERE rl."sessionId" = ANY($1)
         AND rl.id IN (
           SELECT rl2.id FROM "RouteLocation" rl2
           WHERE rl2."sessionId" = rl."sessionId"
           ORDER BY rl2."recordedAt" DESC
           LIMIT 500
         )
       ORDER BY rl."recordedAt" ASC`,
      [sessionIds]
    );

    // Fetch shop visits with shop names
    const visitsRes = await pool.query(
      `SELECT rsv.*, s.name AS "shopName"
       FROM "RouteShopVisit" rsv
       LEFT JOIN "Shop" s ON rsv."shopId" = s.id
       WHERE rsv."sessionId" = ANY($1)
       ORDER BY rsv."enterTime" ASC`,
      [sessionIds]
    );

    // Group by sessionId
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

    const sessions = sessionsRes.rows.map((row: any) => ({
      id: row.id,
      orderbookerId: row.orderbookerId,
      orderbookerName: row.orderbookerName,
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
      locations: locationsBySession[row.id] || [],
      shopVisits: visitsBySession[row.id] || [],
    }));

    return NextResponse.json({ sessions, total });
  } catch (error) {
    console.error('Error fetching session history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session history' },
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
