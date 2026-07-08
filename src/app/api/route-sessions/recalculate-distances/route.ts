import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAdmin } from '@/lib/auth-guard';

// POST /api/route-sessions/recalculate-distances
// Admin-only: backfills totalDistance + totalDuration for ended/auto_ended sessions
// where the stored value is 0 (e.g. legacy auto-ended sessions where the stale-session
// detector didn't compute distance before marking as ended).
//
// Query params (all optional):
//   - sessionId: recalculate only a specific session (single-shot)
//   - daysBack:  recalculate sessions started within last N days (default: 30)
//   - limit:     max sessions to process (default: 500)
//
// Response:
//   {
//     processed: number,
//     updated: number,
//     skipped: number,         // sessions where stored distance was already non-zero OR no GPS points
//     errors: string[],
//     sample: [{ sessionId, oldDistance, newDistance, newDuration }]
//   }
export async function POST(request: NextRequest) {
  // Admin-only
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || 'Admin access required' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { sessionId } = body;
    const daysBack = Math.min(Math.max(parseInt(body.daysBack || '30', 10) || 30, 1), 365);
    const limit = Math.min(Math.max(parseInt(body.limit || '500', 10) || 500, 1), 5000);

    const pool = getPool();

    // 1. Find candidate sessions (ended/auto_ended with totalDistance = 0)
    const conditions: string[] = [
      `rs.status IN ('ended', 'auto_ended')`,
      `(rs."totalDistance" IS NULL OR rs."totalDistance" = 0)`,
    ];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (sessionId) {
      conditions.push(`rs.id = $${paramIdx++}`);
      params.push(sessionId);
    } else {
      // Filter by recent days to avoid touching very old data
      conditions.push(`rs."startTime" >= NOW() - INTERVAL '${daysBack} days'`);
    }

    const candidatesRes = await pool.query(
      `SELECT rs.id, rs."startTime", rs."endTime"
       FROM "RouteSession" rs
       WHERE ${conditions.join(' AND ')}
       ORDER BY rs."startTime" DESC
       LIMIT $${paramIdx++}`,
      [...params, limit]
    );

    if (candidatesRes.rows.length === 0) {
      return NextResponse.json({
        processed: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        message: 'No sessions need recalculation.',
      });
    }

    const candidateIds = candidatesRes.rows.map((r: any) => r.id);

    // 2. Compute distance + duration in a single batched UPDATE using a CTE that
    //    does the haversine sum per session.
    const updateRes = await pool.query(
      `UPDATE "RouteSession" AS rs
       SET
         "totalDistance" = sub."totalDistance",
         "totalDuration" = sub."totalDuration",
         "updatedAt" = NOW()
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
           CASE
             WHEN s."endTime" IS NOT NULL
               THEN GREATEST(0, EXTRACT(EPOCH FROM (s."endTime" - s."startTime")))::int
             ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - s."startTime")))::int
           END AS "totalDuration"
         FROM "RouteSession" s
         WHERE s.id = ANY($1::text[])
       ) AS sub
       WHERE rs.id = sub.session_id
         AND (rs."totalDistance" IS NULL OR rs."totalDistance" = 0)
       RETURNING rs.id, rs."totalDistance", rs."totalDuration"`,
      [candidateIds]
    );

    // 3. Build a small sample for visibility (first 10 updated sessions)
    const sample = updateRes.rows.slice(0, 10).map((r: any) => ({
      sessionId: r.id,
      newDistance: Number(r.totalDistance),
      newDuration: r.totalDuration,
    }));

    // 4. Count skipped = candidates with no GPS points (distance still 0 after update)
    const skipped = updateRes.rows.filter((r: any) => Number(r.totalDistance) === 0).length;
    const updated = updateRes.rows.length - skipped;

    return NextResponse.json({
      processed: candidatesRes.rows.length,
      updated,
      skipped,
      errors: [],
      sample,
      message: `Recalculated distance for ${updated} session(s). ${skipped} session(s) had no GPS points.`,
    });
  } catch (error) {
    console.error('Error recalculating distances:', error);
    return NextResponse.json({ error: 'Failed to recalculate distances' }, { status: 500 });
  }
}
