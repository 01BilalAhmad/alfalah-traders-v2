import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';

// POST /api/route-sessions/end
// End an active route session.
// Body: { sessionId, endLat?, endLng?, endAddress?, autoEndReason? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, endLat, endLng, endAddress, autoEndReason } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Fetch the session
      const sessionRes = await client.query(
        `SELECT * FROM "RouteSession" WHERE id = $1 FOR UPDATE`,
        [sessionId]
      );

      if (sessionRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }

      const session = sessionRes.rows[0];

      if (session.status !== 'active') {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Session is not active', session: serializeSession(session) },
          { status: 400 }
        );
      }

      // Calculate total duration from startTime to now
      const startTime = new Date(session.startTime);
      const endTime = new Date();
      const totalDuration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

      // Calculate total distance from all recorded locations
      const distRes = await client.query(
        `SELECT COALESCE(SUM(
          CASE
            WHEN prev.lat IS NOT NULL AND prev.lng IS NOT NULL THEN
              6371000 * 2 * ATAN2(
                SQRT(
                  POWER(SIN(RADIANS($1 - prev.lat) / 2), 2) +
                  COS(RADIANS(prev.lat)) * COS(RADIANS($1)) *
                  POWER(SIN(RADIANS($2 - prev.lng) / 2), 2)
                ),
                SQRT(1 - (
                  POWER(SIN(RADIANS($1 - prev.lat) / 2), 2) +
                  COS(RADIANS(prev.lat)) * COS(RADIANS($1)) *
                  POWER(SIN(RADIANS($2 - prev.lng) / 2), 2)
                ))
              )
            ELSE 0
          END
        ), 0) AS "totalDistance"
        FROM "RouteLocation" curr
        LEFT JOIN LATERAL (
          SELECT lat, lng FROM "RouteLocation"
          WHERE "sessionId" = $3 AND "recordedAt" < curr."recordedAt"
          ORDER BY "recordedAt" DESC LIMIT 1
        ) prev ON true
        WHERE curr."sessionId" = $3`,
        [0, 0, sessionId] // placeholder params - real calc done differently
      );

      // Simpler distance calculation: sum haversine between consecutive points
      const distCalcRes = await client.query(
        `WITH ordered_locations AS (
          SELECT lat, lng, "recordedAt",
                 LAG(lat) OVER (PARTITION BY "sessionId" ORDER BY "recordedAt") AS prev_lat,
                 LAG(lng) OVER (PARTITION BY "sessionId" ORDER BY "recordedAt") AS prev_lng
          FROM "RouteLocation"
          WHERE "sessionId" = $1
        )
        SELECT COALESCE(SUM(
          CASE
            WHEN prev_lat IS NOT NULL AND prev_lng IS NOT NULL THEN
              6371000 * 2 * ATAN2(
                SQRT(
                  POWER(SIN(RADIANS(lat - prev_lat) / 2), 2) +
                  COS(RADIANS(prev_lat)) * COS(RADIANS(lat)) *
                  POWER(SIN(RADIANS(lng - prev_lng) / 2), 2)
                ),
                SQRT(1 - (
                  POWER(SIN(RADIANS(lat - prev_lat) / 2), 2) +
                  COS(RADIANS(prev_lat)) * COS(RADIANS(lat)) *
                  POWER(SIN(RADIANS(lng - prev_lng) / 2), 2)
                ))
              )
            ELSE 0
          END
        ), 0) AS "totalDistance"
        FROM ordered_locations`,
        [sessionId]
      );

      const totalDistance = Number(distCalcRes.rows[0]?.totalDistance || 0);

      // Determine the status
      const status = autoEndReason ? 'auto_ended' : 'ended';

      // Update the session
      const updateRes = await client.query(
        `UPDATE "RouteSession"
         SET "endTime" = $1,
             "endLat" = $2,
             "endLng" = $3,
             "endAddress" = $4,
             "totalDistance" = $5,
             "totalDuration" = $6,
             status = $7,
             "autoEndReason" = $8,
             "updatedAt" = NOW()
         WHERE id = $9
         RETURNING *`,
        [
          endTime.toISOString(),
          endLat ?? null,
          endLng ?? null,
          endAddress ?? null,
          totalDistance,
          totalDuration,
          status,
          autoEndReason ?? null,
          sessionId,
        ]
      );

      // Close any open shop visits (set exitTime for visits without one)
      await client.query(
        `UPDATE "RouteShopVisit"
         SET "exitTime" = $1,
             "exitLat" = $2,
             "exitLng" = $3,
             "timeSpent" = EXTRACT(EPOCH FROM ($1::timestamp - "enterTime"))::int,
             "updatedAt" = NOW()
         WHERE "sessionId" = $4 AND "exitTime" IS NULL`,
        [endTime.toISOString(), endLat ?? null, endLng ?? null, sessionId]
      );

      await client.query('COMMIT');

      // Fetch shop visits for the response
      const pool = getPool();
      const visitsRes = await pool.query(
        `SELECT rsv.*, s.name AS "shopName"
         FROM "RouteShopVisit" rsv
         LEFT JOIN "Shop" s ON rsv."shopId" = s.id
         WHERE rsv."sessionId" = $1
         ORDER BY rsv."enterTime" ASC`,
        [sessionId]
      );

      return NextResponse.json({
        session: serializeSession(updateRes.rows[0]),
        shopVisits: visitsRes.rows.map(serializeShopVisit),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error ending route session:', error);
    return NextResponse.json(
      { error: 'Failed to end route session' },
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
