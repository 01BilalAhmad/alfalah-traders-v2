import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';

// POST /api/route-sessions/resume
// Resume an ended route session on the same day it was started.
// Re-opens the session: status → 'active', clears endTime/endLat/endLng/endAddress,
// preserves totalDistance/totalDuration (recomputed on next end), preserves shop visits.
//
// Rules:
// - Session must exist and have status = 'ended' or 'auto_ended'
// - Session must have been started TODAY (same calendar day in server timezone)
// - Orderbooker must not already have another active session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const pool = getPool();

    // 1. Fetch the session to resume
    const sessionRes = await pool.query(
      `SELECT id, "orderbookerId", "startTime", "endTime", status, "autoEndReason",
              "startLat", "startLng", "startAddress", "totalDistance", "totalDuration"
       FROM "RouteSession" WHERE id = $1`,
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const session = sessionRes.rows[0];

    if (session.status === 'active') {
      // Already active — just return it as success (idempotent)
      return NextResponse.json({
        session: {
          id: session.id,
          orderbookerId: session.orderbookerId,
          startTime: session.startTime instanceof Date ? session.startTime.toISOString() : session.startTime,
          endTime: null,
          startLat: session.startLat,
          startLng: session.startLng,
          startAddress: session.startAddress,
          endLat: null,
          endLng: null,
          endAddress: null,
          totalDistance: Number(session.totalDistance || 0),
          totalDuration: session.totalDuration,
          status: 'active',
          autoEndReason: null,
        },
        resumed: false,
        message: 'Session is already active',
      });
    }

    if (session.status !== 'ended' && session.status !== 'auto_ended') {
      return NextResponse.json(
        { error: `Cannot resume session with status: ${session.status}` },
        { status: 409 }
      );
    }

    // 2. Same-day check: session must have been started today (server local day)
    const startDate = new Date(session.startTime);
    const now = new Date();
    const sameDay =
      startDate.getFullYear() === now.getFullYear() &&
      startDate.getMonth() === now.getMonth() &&
      startDate.getDate() === now.getDate();

    if (!sameDay) {
      return NextResponse.json(
        { error: 'Cannot resume a route from a previous day. Please start a new route.' },
        { status: 409 }
      );
    }

    // 3. Ensure the orderbooker doesn't already have another active session
    const otherActiveRes = await pool.query(
      `SELECT id FROM "RouteSession"
       WHERE "orderbookerId" = $1 AND status = 'active' AND id <> $2
       LIMIT 1`,
      [session.orderbookerId, session.id]
    );

    if (otherActiveRes.rows.length > 0) {
      return NextResponse.json(
        {
          error: 'You already have an active route session. End it first before resuming another.',
          activeSessionId: otherActiveRes.rows[0].id,
        },
        { status: 409 }
      );
    }

    // 4. Resume the session (transactional)
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const nowISO = now.toISOString();
      await client.query(
        `UPDATE "RouteSession"
         SET status = 'active',
             "endTime" = NULL,
             "endLat" = NULL,
             "endLng" = NULL,
             "endAddress" = NULL,
             "autoEndReason" = NULL,
             "updatedAt" = $1
         WHERE id = $2`,
        [nowISO, session.id]
      );

      // Re-open shop visits that were closed at end-time — set exitTime back to NULL
      // so they continue to accumulate time until the next end event.
      // NOTE: we only re-open visits that were closed by THIS session's endRoute
      // (i.e. exitTime == session.endTime). Visits closed earlier (shop exit) stay closed.
      if (session.endTime) {
        const sessionEndISO = session.endTime instanceof Date ? session.endTime.toISOString() : session.endTime;
        await client.query(
          `UPDATE "RouteShopVisit"
           SET "exitTime" = NULL, "timeSpent" = NULL, "updatedAt" = $1
           WHERE "sessionId" = $2 AND "exitTime" = $3`,
          [nowISO, session.id, sessionEndISO]
        );
      }

      await client.query('COMMIT');

      return NextResponse.json({
        session: {
          id: session.id,
          orderbookerId: session.orderbookerId,
          startTime: startDate.toISOString(),
          endTime: null,
          startLat: session.startLat,
          startLng: session.startLng,
          startAddress: session.startAddress,
          endLat: null,
          endLng: null,
          endAddress: null,
          totalDistance: Number(session.totalDistance || 0),
          totalDuration: session.totalDuration,
          status: 'active',
          autoEndReason: null,
        },
        resumed: true,
        message: 'Route resumed successfully',
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error resuming route session:', error);
    return NextResponse.json({ error: 'Failed to resume route session' }, { status: 500 });
  }
}
