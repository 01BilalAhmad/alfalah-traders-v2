import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { resolveDistance } from '@/lib/distance';

// GET /api/route-sessions/history?orderbookerId=xxx&date=YYYY-MM-DD&limit=50
// Get historical route session data for map rendering
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const dateStr = searchParams.get('date'); // YYYY-MM-DD
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    const pool = getPool();

    // Build query conditions
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    // Only include ended/auto_ended sessions in history, plus active sessions for today
    conditions.push(`(rs.status IN ('ended', 'auto_ended') OR (rs.status = 'active' AND rs."startTime" >= CURRENT_DATE))`);

    if (orderbookerId) {
      conditions.push(`rs."orderbookerId" = $${paramIdx++}`);
      params.push(orderbookerId);
    }

    // Date filter: sessions that started on that date in Pakistan timezone (UTC+5)
    if (dateStr) {
      const pkOffsetMs = 5 * 60 * 60 * 1000;
      const [year, month, day] = dateStr.split('-').map(Number);
      const startUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)).getTime() - pkOffsetMs;
      const endUTC = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)).getTime() - pkOffsetMs;

      conditions.push(`rs."startTime" >= $${paramIdx++}`);
      params.push(new Date(startUTC).toISOString());

      conditions.push(`rs."startTime" <= $${paramIdx++}`);
      params.push(new Date(endUTC).toISOString());
    }

    // Count total matching sessions
    const countRes = await pool.query(
      `SELECT COUNT(*) AS total
       FROM "RouteSession" rs
       WHERE ${conditions.join(' AND ')}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.total || '0');

    // Fetch sessions
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

    const sessionIds = sessionsRes.rows.map((s: { id: string }) => s.id);

    // Batch fetch locations (max 500 per session, using SQL-level ROW_NUMBER)
    const locationsRes = await pool.query(
      `SELECT sub.* FROM (
         SELECT rl.*,
                ROW_NUMBER() OVER (PARTITION BY rl."sessionId" ORDER BY rl."recordedAt" ASC) AS rn,
                COUNT(*) OVER (PARTITION BY rl."sessionId") AS total_count
         FROM "RouteLocation" rl
         WHERE rl."sessionId" = ANY($1)
       ) sub
       WHERE sub.rn > sub.total_count - 500
       ORDER BY sub."sessionId", sub."recordedAt" ASC`,
      [sessionIds]
    );

    // Build map of sessionId → locations
    const locMap: Record<string, unknown[]> = {};

    for (const row of locationsRes.rows) {
      if (!locMap[row.sessionId]) locMap[row.sessionId] = [];
      locMap[row.sessionId].push({
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
      });
    }

    // Batch fetch shop visits with shop name
    const shopVisitsRes = await pool.query(
      `SELECT rsv.*, s.name AS "shopName"
       FROM "RouteShopVisit" rsv
       LEFT JOIN "Shop" s ON rsv."shopId" = s.id
       WHERE rsv."sessionId" = ANY($1)
       ORDER BY rsv."enterTime" ASC`,
      [sessionIds]
    );

    // Build map of sessionId → shop visits
    const visitsMap: Record<string, unknown[]> = {};
    for (const row of shopVisitsRes.rows) {
      if (!visitsMap[row.sessionId]) visitsMap[row.sessionId] = [];

      visitsMap[row.sessionId].push({
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

    // Compose final sessions array
    const sessions = sessionsRes.rows.map((s: Record<string, unknown>) => {
      const sessionLocations = (locMap[s.id as string] || []) as Array<{ lat: number; lng: number }>;
      // On-the-fly distance computation: if stored totalDistance is 0 but we have
      // RouteLocation points, compute the distance live so the admin UI shows a real
      // value even for legacy auto-ended sessions where the stale detector didn't
      // compute distance before marking as ended.
      const { distance: effectiveDistance, computedLive } = resolveDistance(
        Number(s.totalDistance),
        sessionLocations
      );

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
          totalDistance: effectiveDistance,
          totalDuration: s.totalDuration,
          status: s.status,
          autoEndReason: s.autoEndReason,
          distanceComputedLive: computedLive,
        },
        locations: sessionLocations,
        shopVisits: visitsMap[s.id as string] || [],
        orderbooker: {
          id: s.orderbookerId,
          name: s.orderbookerName,
        },
      };
    });

    return NextResponse.json({ sessions, total });
  } catch (error) {
    console.error('Error fetching route session history:', error);
    return NextResponse.json({ error: 'Failed to fetch route session history' }, { status: 500 });
  }
}
