import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';

// POST /api/route-sessions/end
// End an active route tracking session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, endLat, endLng, endAddress, autoEndReason, status: requestStatus } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const pool = getPool();

    // Verify session exists and is active
    const sessionRes = await pool.query(
      'SELECT * FROM "RouteSession" WHERE id = $1',
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const session = sessionRes.rows[0];

    if (session.status !== 'active') {
      return NextResponse.json(
        { error: 'Session is not active', status: session.status },
        { status: 409 }
      );
    }

    const now = new Date();
    const endTime = now.toISOString();
    const startTime = new Date(session.startTime);

    // Compute total duration in seconds
    const totalDuration = Math.round((now.getTime() - startTime.getTime()) / 1000);

    // Compute total distance from RouteLocation points using haversine with LEAD() window function
    // This is O(n) instead of the previous O(n²) self-join approach
    const distRes = await pool.query(
      `SELECT COALESCE(SUM(seg_dist), 0) AS "totalDistance"
       FROM (
         SELECT
           6371000 * 2 * ATAN2(
             SQRT(
               POWER(SIN(RADIANS(next_lat - lat) / 2), 2) +
               COS(RADIANS(lat)) * COS(RADIANS(next_lat)) *
               POWER(SIN(RADIANS(next_lng - lng) / 2), 2)
             ),
             SQRT(1 - (
               POWER(SIN(RADIANS(next_lat - lat) / 2), 2) +
               COS(RADIANS(lat)) * COS(RADIANS(next_lat)) *
               POWER(SIN(RADIANS(next_lng - lng) / 2), 2)
             ))
           ) AS seg_dist
         FROM (
           SELECT lat, lng,
                  LEAD(lat) OVER (PARTITION BY "sessionId" ORDER BY "recordedAt") AS next_lat,
                  LEAD(lng) OVER (PARTITION BY "sessionId" ORDER BY "recordedAt") AS next_lng
           FROM "RouteLocation"
           WHERE "sessionId" = $1
         ) sub
         WHERE next_lat IS NOT NULL
       ) dist_sub`,
      [sessionId]
    );

    const totalDistance = Math.round(Number(distRes.rows[0]?.totalDistance || 0));

    // Use a transaction for the update + shop visit cleanup
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Update the session
      const finalStatus = requestStatus === 'auto_ended' ? 'auto_ended' : 'ended';
      const finalAutoEndReason = autoEndReason || null;
      await client.query(
        `UPDATE "RouteSession"
         SET "endTime" = $1, "endLat" = $2, "endLng" = $3, "endAddress" = $4,
             "totalDistance" = $5, "totalDuration" = $6, status = $7, "autoEndReason" = $8, "updatedAt" = $9
         WHERE id = $10`,
        [
          endTime,
          endLat ?? session.endLat ?? null,
          endLng ?? session.endLng ?? null,
          endAddress ?? session.endAddress ?? null,
          totalDistance,
          totalDuration,
          finalStatus,
          finalAutoEndReason,
          endTime,
          sessionId,
        ]
      );

      // Close any open RouteShopVisits (exitTime is null)
      const openVisitsRes = await client.query(
        `SELECT id, "enterTime" FROM "RouteShopVisit"
         WHERE "sessionId" = $1 AND "exitTime" IS NULL`,
        [sessionId]
      );

      let shopsVisited = openVisitsRes.rows.length;

      // Batch-update all open visits in a single query (avoids N+1)
      if (openVisitsRes.rows.length > 0) {
        const visitIds = openVisitsRes.rows.map((v: any) => v.id);
        const timeSpents = openVisitsRes.rows.map((v: any) => {
          const enterTime = new Date(v.enterTime);
          return Math.round((now.getTime() - enterTime.getTime()) / 1000);
        });

        await client.query(
          `UPDATE "RouteShopVisit" AS rsv
           SET "exitTime" = $1,
               "timeSpent" = sub."timeSpent",
               "updatedAt" = $2
           FROM (
             SELECT unnest($3::text[]) AS id,
                    unnest($4::int[]) AS "timeSpent"
           ) AS sub
           WHERE rsv.id = sub.id`,
          [endTime, endTime, visitIds, timeSpents]
        );
      }

      // Count total shop visits (including already closed ones)
      const visitCountRes = await client.query(
        'SELECT COUNT(*) AS count FROM "RouteShopVisit" WHERE "sessionId" = $1',
        [sessionId]
      );
      shopsVisited = parseInt(visitCountRes.rows[0]?.count || '0');

      // Count total locations
      const locCountRes = await client.query(
        'SELECT COUNT(*) AS count FROM "RouteLocation" WHERE "sessionId" = $1',
        [sessionId]
      );
      const locationsCount = parseInt(locCountRes.rows[0]?.count || '0');

      await client.query('COMMIT');

      return NextResponse.json({
        session: {
          id: sessionId,
          orderbookerId: session.orderbookerId,
          startTime: startTime.toISOString(),
          endTime,
          startLat: session.startLat,
          startLng: session.startLng,
          startAddress: session.startAddress,
          endLat: endLat ?? session.endLat ?? null,
          endLng: endLng ?? session.endLng ?? null,
          endAddress: endAddress ?? session.endAddress ?? null,
          totalDistance,
          totalDuration,
          status: finalStatus,
          autoEndReason: finalAutoEndReason,
        },
        summary: {
          totalDistance,
          totalDuration,
          shopsVisited,
          locationsCount,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error ending route session:', error);
    return NextResponse.json({ error: 'Failed to end route session' }, { status: 500 });
  }
}
