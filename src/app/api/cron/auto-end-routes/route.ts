import { NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';

// GET /api/cron/auto-end-routes
// Called by Vercel Cron to auto-end route sessions that started before today 12:00 AM Pakistan time
// No auth required (called by Vercel Cron)
export async function GET() {
  try {
    const pool = getPool();

    // Calculate today's 12:00 AM in Pakistan timezone (UTC+5)
    // Pakistan is UTC+5, so midnight PKT = 19:00 UTC of the previous day
    const now = new Date();
    const pkOffsetMs = 5 * 60 * 60 * 1000;
    const pkNow = new Date(now.getTime() + pkOffsetMs);

    // Today's midnight in PKT
    const pkMidnight = new Date(
      Date.UTC(pkNow.getUTCFullYear(), pkNow.getUTCMonth(), pkNow.getUTCDate(), 0, 0, 0, 0)
    );
    // Convert PKT midnight to UTC (subtract 5 hours)
    const midnightUTC = new Date(pkMidnight.getTime() - pkOffsetMs);

    // Find all active sessions where startTime < today's 12:00 AM Pakistan time
    const activeRes = await pool.query(
      `SELECT id, "orderbookerId", "startTime" FROM "RouteSession"
       WHERE status = 'active' AND "startTime" < $1`,
      [midnightUTC.toISOString()]
    );

    if (activeRes.rows.length === 0) {
      return NextResponse.json({ endedCount: 0, message: 'No active sessions to auto-end' });
    }

    // Set endTime to 12:00 AM Pakistan time (in UTC)
    const endTime = midnightUTC.toISOString();
    const updatedAt = new Date().toISOString();
    let endedCount = 0;

    for (const session of activeRes.rows) {
      const sessionId = session.id;
      const startTime = new Date(session.startTime);

      // Compute total duration in seconds
      const totalDuration = Math.round(
        (new Date(endTime).getTime() - startTime.getTime()) / 1000
      );

      // Compute total distance from RouteLocation points using haversine
      const distRes = await pool.query(
        `SELECT COALESCE(SUM(
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
        ), 0) AS "totalDistance"
        FROM "RouteLocation" rl1
        INNER JOIN "RouteLocation" rl2 ON rl1."sessionId" = rl2."sessionId"
          AND rl2."recordedAt" = (
            SELECT MIN(rl3."recordedAt")
            FROM "RouteLocation" rl3
            WHERE rl3."sessionId" = rl1."sessionId"
              AND rl3."recordedAt" > rl1."recordedAt"
          )
        WHERE rl1."sessionId" = $1`,
        [sessionId]
      );

      const totalDistance = Math.round(Number(distRes.rows[0]?.totalDistance || 0));

      const client = await getClient();
      try {
        await client.query('BEGIN');

        // Update the session
        await client.query(
          `UPDATE "RouteSession"
           SET "endTime" = $1, "totalDistance" = $2, "totalDuration" = $3,
               status = $4, "autoEndReason" = $5, "updatedAt" = $6
           WHERE id = $7`,
          [endTime, totalDistance, totalDuration, 'auto_ended', '12am_auto', updatedAt, sessionId]
        );

        // Close any open RouteShopVisits
        const openVisitsRes = await client.query(
          `SELECT id, "enterTime" FROM "RouteShopVisit"
           WHERE "sessionId" = $1 AND "exitTime" IS NULL`,
          [sessionId]
        );

        if (openVisitsRes.rows.length > 0) {
          // Batch-update all open visits in a single query (avoids N+1)
          // Use unnest to pass parallel arrays of ids + timeSpent values.
          const visitIds = openVisitsRes.rows.map((v: any) => v.id);
          const timeSpents = openVisitsRes.rows.map((v: any) => {
            const enterTime = new Date(v.enterTime);
            return Math.round((new Date(endTime).getTime() - enterTime.getTime()) / 1000);
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
            [endTime, updatedAt, visitIds, timeSpents]
          );
        }

        await client.query('COMMIT');
        endedCount++;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error auto-ending session ${sessionId}:`, error);
        // Continue with other sessions
      } finally {
        client.release();
      }
    }

    return NextResponse.json({
      endedCount,
      message: `Auto-ended ${endedCount} route session(s)`,
      autoEndTime: endTime,
    });
  } catch (error) {
    console.error('Error in auto-end-routes cron:', error);
    return NextResponse.json({ error: 'Failed to auto-end route sessions' }, { status: 500 });
  }
}
