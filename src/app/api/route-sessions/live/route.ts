import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/route-sessions/live?orderbookerId=xxx (optional)
// Get live tracking data for all (or filtered) active route sessions
// This endpoint is polled by admin web every 5 seconds
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');

    const pool = getPool();

    // Find all active RouteSession records (optionally filtered by orderbookerId)
    let sessionsQuery = `
      SELECT rs.*, u.name AS "orderbookerName", u.phone AS "orderbookerPhone"
      FROM "RouteSession" rs
      INNER JOIN "User" u ON rs."orderbookerId" = u.id
      WHERE rs.status = 'active'
    `;
    const queryParams: unknown[] = [];

    if (orderbookerId) {
      sessionsQuery += ` AND rs."orderbookerId" = $1`;
      queryParams.push(orderbookerId);
    }

    sessionsQuery += ` ORDER BY rs."startTime" DESC`;

    const sessionsRes = await pool.query(sessionsQuery, queryParams);

    if (sessionsRes.rows.length === 0) {
      return NextResponse.json({
        sessions: [],
        timestamp: new Date().toISOString(),
      });
    }

    // For each session, get the latest location, locations (for polyline), and shop visits
    const sessionIds = sessionsRes.rows.map((s: { id: string }) => s.id);

    // Batch fetch latest location per session
    const latestLocsRes = await pool.query(
      `SELECT DISTINCT ON (rl."sessionId")
         rl."sessionId",
         rl.lat,
         rl.lng,
         rl.accuracy,
         rl."recordedAt"
       FROM "RouteLocation" rl
       WHERE rl."sessionId" = ANY($1)
       ORDER BY rl."sessionId", rl."recordedAt" DESC`,
      [sessionIds]
    );

    // Build a map of sessionId → latest location
    const latestLocMap: Record<string, { lat: number; lng: number; accuracy: number | null; recordedAt: string }> = {};
    for (const row of latestLocsRes.rows) {
      latestLocMap[row.sessionId] = {
        lat: Number(row.lat),
        lng: Number(row.lng),
        accuracy: row.accuracy != null ? Number(row.accuracy) : null,
        recordedAt: row.recordedAt instanceof Date ? row.recordedAt.toISOString() : row.recordedAt,
      };
    }

    // Batch fetch ALL locations for each session (for polyline drawing)
    // Limit to last 500 points per session to keep payload manageable
    const locationsRes = await pool.query(
      `SELECT rl."sessionId", rl.lat, rl.lng, rl.accuracy, rl.speed, rl."recordedAt"
       FROM "RouteLocation" rl
       WHERE rl."sessionId" = ANY($1)
       ORDER BY rl."sessionId", rl."recordedAt" ASC`,
      [sessionIds]
    );

    // Build a map of sessionId → locations array (limit 500 per session)
    const locationsMap: Record<string, Array<{
      lat: number; lng: number; accuracy: number | null; speed: number | null; recordedAt: string;
    }>> = {};
    const locCounts: Record<string, number> = {};

    for (const row of locationsRes.rows) {
      const sid = row.sessionId;
      if (!locationsMap[sid]) {
        locationsMap[sid] = [];
        locCounts[sid] = 0;
      }
      locCounts[sid]++;
      if (locCounts[sid] <= 500) {
        locationsMap[sid].push({
          lat: Number(row.lat),
          lng: Number(row.lng),
          accuracy: row.accuracy != null ? Number(row.accuracy) : null,
          speed: row.speed != null ? Number(row.speed) : null,
          recordedAt: row.recordedAt instanceof Date ? row.recordedAt.toISOString() : row.recordedAt,
        });
      }
    }

    // Batch fetch shop visits for all sessions
    const shopVisitsRes = await pool.query(
      `SELECT rsv.*, s.name AS "shopName"
       FROM "RouteShopVisit" rsv
       LEFT JOIN "Shop" s ON rsv."shopId" = s.id
       WHERE rsv."sessionId" = ANY($1)
       ORDER BY rsv."enterTime" ASC`,
      [sessionIds]
    );

    // Build a map of sessionId → shop visits array
    const shopVisitsMap: Record<string, unknown[]> = {};
    for (const row of shopVisitsRes.rows) {
      if (!shopVisitsMap[row.sessionId]) shopVisitsMap[row.sessionId] = [];

      shopVisitsMap[row.sessionId].push({
        id: row.id,
        sessionId: row.sessionId,
        shopId: row.shopId,
        shopName: row.shopName,
        orderbookerId: row.orderbookerId,
        enterLat: row.enterLat,
        enterLng: row.enterLng,
        exitLat: row.exitLat,
        exitLng: row.exitLng,
        enterTime: row.enterTime instanceof Date ? row.enterTime.toISOString() : row.enterTime,
        exitTime: row.exitTime instanceof Date ? row.exitTime.toISOString() : row.exitTime,
        timeSpent: row.timeSpent,
        distanceToShop: row.distanceToShop != null ? Number(row.distanceToShop) : null,
        isAutoDetected: row.isAutoDetected,
      });
    }

    // Compute live duration for active sessions
    const now = Date.now();

    // Compose final response
    const sessions = sessionsRes.rows.map((s: Record<string, unknown>) => {
      const startTime = s.startTime instanceof Date ? (s.startTime as Date).getTime() : new Date(s.startTime as string).getTime();
      const liveDuration = Math.max(0, Math.round((now - startTime) / 1000));

      return {
        session: {
          id: s.id,
          orderbookerId: s.orderbookerId,
          startTime: s.startTime instanceof Date ? (s.startTime as Date).toISOString() : s.startTime,
          endTime: s.endTime instanceof Date ? (s.endTime as Date).toISOString() : s.endTime,
          startLat: s.startLat,
          startLng: s.startLng,
          startAddress: s.startAddress,
          endLat: s.endLat,
          endLng: s.endLng,
          endAddress: s.endAddress,
          totalDistance: Number(s.totalDistance),
          totalDuration: s.totalDuration || liveDuration,
          status: s.status,
          autoEndReason: s.autoEndReason,
        },
        latestLocation: latestLocMap[s.id as string] || null,
        locations: locationsMap[s.id as string] || [],
        shopVisits: shopVisitsMap[s.id as string] || [],
        orderbooker: {
          id: s.orderbookerId,
          name: s.orderbookerName,
          phone: s.orderbookerPhone,
        },
      };
    });

    return NextResponse.json({
      sessions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching live route sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch live route sessions' }, { status: 500 });
  }
}
