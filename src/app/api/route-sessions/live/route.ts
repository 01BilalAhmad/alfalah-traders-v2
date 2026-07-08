import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';
import { resolveDistance } from '@/lib/distance';

// ── Auto-end stale sessions ──────────────────────────────────────────
// Sessions that haven't received GPS updates for 60+ minutes are likely dead
// (app crashed, force-closed, or endRoute API call failed)
const STALE_SESSION_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes (generous threshold)

async function autoEndStaleSessions(): Promise<number> {
  try {
    const pool = getPool();
    const now = new Date();
    const nowIso = now.toISOString();

    // Find active sessions with no GPS update in the last 60 minutes
    const staleRes = await pool.query(
      `SELECT rs.id, rs."orderbookerId", rs."startTime"
       FROM "RouteSession" rs
       LEFT JOIN (
         SELECT DISTINCT ON ("sessionId") "sessionId", "recordedAt"
         FROM "RouteLocation"
         ORDER BY "sessionId", "recordedAt" DESC
       ) latest ON rs.id = latest."sessionId"
       WHERE rs.status = 'active'
         AND (latest."recordedAt" IS NULL OR latest."recordedAt" < $1)
         AND rs."startTime" < $1`,
      [new Date(now.getTime() - STALE_SESSION_THRESHOLD_MS).toISOString()]
    );

    if (staleRes.rows.length === 0) return 0;

    const sessionIds = staleRes.rows.map((r: any) => r.id);
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. Mark all stale sessions as auto_ended AND compute distance + duration in a single query.
      // Distance is computed via haversine using a correlated subquery over RouteLocation pairs.
      // Duration = seconds between startTime and now.
      await client.query(
        `UPDATE "RouteSession" AS rs
         SET
           status = 'auto_ended',
           "autoEndReason" = 'no_gps_updates_60min',
           "endTime" = $1,
           "totalDistance" = COALESCE(sub."totalDistance", 0),
           "totalDuration" = sub."totalDuration",
           "updatedAt" = $1
         FROM (
           SELECT
             s.id AS session_id,
             COALESCE((
               SELECT SUM(
                 6371000 * 2 * ATAN2(
                   SQRT(
                     POWER(SIN(RADIANS(rl2.lat - rl1.lat) / 2), 2) +
                     COS(RADIANS(rl1.lat)) * COS(RADIANS(rl2.lat)) *
                     POWER(SIN(RADIANS(rl2.lng - rl1.lng) / 2), 2)
                   ),
                   SQRT(1 - (
                     POWER(SIN(RADIANS(rl2.lat - rl1.lat) / 2), 2) +
                     COS(RADIANS(rl1.lat)) * COS(RADIANS(rl2.lat)) *
                     POWER(SIN(RADIANS(rl2.lng - rl1.lng) / 2), 2)
                   ))
                 )
               )
               FROM "RouteLocation" rl1
               INNER JOIN "RouteLocation" rl2 ON rl1."sessionId" = rl2."sessionId"
                 AND rl2."recordedAt" = (
                   SELECT MIN(rl3."recordedAt")
                   FROM "RouteLocation" rl3
                   WHERE rl3."sessionId" = rl1."sessionId"
                     AND rl3."recordedAt" > rl1."recordedAt"
                 )
               WHERE rl1."sessionId" = s.id
             ), 0) AS "totalDistance",
             GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - s."startTime")))::int AS "totalDuration"
           FROM "RouteSession" s
           WHERE s.id = ANY($2::text[])
         ) AS sub
         WHERE rs.id = sub.session_id AND rs.status = 'active'`,
        [nowIso, sessionIds]
      );

      // 2. Close any open shop visits for those sessions (also set timeSpent based on enterTime)
      await client.query(
        `UPDATE "RouteShopVisit" AS rsv
         SET "exitTime" = $1,
             "timeSpent" = GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - rsv."enterTime")))::int,
             "updatedAt" = $1
         WHERE rsv."sessionId" = ANY($2::text[]) AND rsv."exitTime" IS NULL`,
        [nowIso, sessionIds]
      );

      const endedCount = sessionIds.length;
      for (const id of sessionIds) {
        console.log(`[Live] Auto-ended stale session ${id} (no GPS for 60+ min) — distance + duration computed`);
      }

      await client.query('COMMIT');
      return endedCount;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Live] Auto-end stale sessions failed:', error);
    return 0;
  }
}

// GET /api/route-sessions/live?orderbookerId=xxx (optional)
// Get live tracking data for all (or filtered) active route sessions
// This endpoint is polled by admin web every 5 seconds
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');

    const pool = getPool();

    // Auto-end stale sessions (no GPS for 30+ minutes) as a safety net
    // This runs only when this endpoint is polled, keeping it lightweight
    try {
      const endedCount = await autoEndStaleSessions();
      if (endedCount > 0) {
        console.log(`[Live] Auto-ended ${endedCount} stale session(s)`);
      }
    } catch (e) {
      // Don't let stale cleanup break the main response
      console.warn('[Live] Stale session cleanup failed:', e);
    }

    // Find all active RouteSession records AND today's ended sessions
    // This ensures ended routes still appear on the website's route tracker
    let sessionsQuery = `
      SELECT rs.*, u.name AS "orderbookerName", u.phone AS "orderbookerPhone"
      FROM "RouteSession" rs
      INNER JOIN "User" u ON rs."orderbookerId" = u.id
      WHERE (rs.status = 'active' OR (rs.status IN ('ended', 'auto_ended') AND rs."startTime" >= CURRENT_DATE))
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

    // Batch fetch locations for each session (for polyline drawing)
    // Use SQL-level LIMIT per session with ROW_NUMBER() to avoid transferring excess data
    const locationsRes = await pool.query(
      `SELECT sub.* FROM (
         SELECT rl."sessionId", rl.lat, rl.lng, rl.accuracy, rl.speed, rl."recordedAt",
                ROW_NUMBER() OVER (PARTITION BY rl."sessionId" ORDER BY rl."recordedAt" ASC) AS rn,
                COUNT(*) OVER (PARTITION BY rl."sessionId") AS total_count
         FROM "RouteLocation" rl
         WHERE rl."sessionId" = ANY($1)
       ) sub
       WHERE sub.rn > sub.total_count - 500
       ORDER BY sub."sessionId", sub."recordedAt" ASC`,
      [sessionIds]
    );

    // Build a map of sessionId → locations array
    const locationsMap: Record<string, Array<{
      lat: number; lng: number; accuracy: number | null; speed: number | null; recordedAt: string;
    }>> = {};

    for (const row of locationsRes.rows) {
      const sid = row.sessionId;
      if (!locationsMap[sid]) locationsMap[sid] = [];
      locationsMap[sid].push({
        lat: Number(row.lat),
        lng: Number(row.lng),
        accuracy: row.accuracy != null ? Number(row.accuracy) : null,
        speed: row.speed != null ? Number(row.speed) : null,
        recordedAt: row.recordedAt instanceof Date ? row.recordedAt.toISOString() : row.recordedAt,
      });
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

      // On-the-fly distance computation: if stored totalDistance is 0 but we have
      // RouteLocation points, compute the distance live so the admin UI shows a real
      // value even for legacy auto-ended sessions where the stale detector didn't
      // compute distance. Returns the stored value when it is non-zero.
      const sessionLocations = locationsMap[s.id as string] || [];
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
          totalDuration: s.totalDuration || liveDuration,
          status: s.status,
          autoEndReason: s.autoEndReason,
          distanceComputedLive: computedLive,
        },
        latestLocation: latestLocMap[s.id as string] || null,
        lastLocationAgeSeconds: latestLocMap[s.id as string]
          ? Math.round((now - new Date(latestLocMap[s.id as string].recordedAt).getTime()) / 1000)
          : null,
        isStale: latestLocMap[s.id as string]
          ? (now - new Date(latestLocMap[s.id as string].recordedAt).getTime()) > STALE_SESSION_THRESHOLD_MS
          : true, // No location at all = stale
        locations: sessionLocations,
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
