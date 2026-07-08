import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import crypto from 'crypto';

// POST /api/route-sessions/start
// Start a new route tracking session for an orderbooker
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderbookerId, startLat, startLng, startAddress } = body;

    if (!orderbookerId) {
      return NextResponse.json({ error: 'orderbookerId is required' }, { status: 400 });
    }

    const pool = getPool();

    // Check if user exists and is an orderbooker
    const userRes = await pool.query(
      'SELECT id, role, status FROM "User" WHERE id = $1',
      [orderbookerId]
    );

    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userRes.rows[0];
    if (user.status === 'inactive') {
      return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 });
    }
    if (user.role !== 'orderbooker') {
      return NextResponse.json({ error: 'Only orderbookers can start route sessions' }, { status: 403 });
    }

    // Check if user already has an active session
    const activeRes = await pool.query(
      'SELECT id, "startTime" FROM "RouteSession" WHERE "orderbookerId" = $1 AND status = $2',
      [orderbookerId, 'active']
    );

    if (activeRes.rows.length > 0) {
      const existingSession = activeRes.rows[0];
      const sessionAge = Date.now() - new Date(existingSession.startTime).getTime();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      // Auto-end stale sessions older than 24 hours (abandoned routes)
      if (sessionAge > ONE_DAY_MS) {
        console.log(`[RouteSessions] Auto-ending stale session ${existingSession.id} (age: ${Math.round(sessionAge / 3600000)}h)`);
        await pool.query(
          `UPDATE "RouteSession" SET status = 'auto_ended', "autoEndReason" = 'stale_session_24h',
           "endTime" = NOW(), "updatedAt" = NOW()
           WHERE id = $1`,
          [existingSession.id]
        );
        // Continue to create new session below
      } else {
        // Active session is recent — return conflict
        return NextResponse.json(
          { error: 'User already has an active route session', activeSessionId: existingSession.id },
          { status: 409 }
        );
      }
    }

    // Create new route session
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const insertRes = await pool.query(
      `INSERT INTO "RouteSession" (id, "orderbookerId", "startTime", "startLat", "startLng", "startAddress", "totalDistance", "totalDuration", status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        sessionId,
        orderbookerId,
        now,
        startLat ?? null,
        startLng ?? null,
        startAddress ?? null,
        0,
        0,
        'active',
        now,
        now,
      ]
    );

    const session = insertRes.rows[0];

    return NextResponse.json({
      session: {
        id: session.id,
        orderbookerId: session.orderbookerId,
        startTime: session.startTime instanceof Date ? session.startTime.toISOString() : session.startTime,
        endTime: session.endTime instanceof Date ? session.endTime.toISOString() : session.endTime,
        startLat: session.startLat,
        startLng: session.startLng,
        startAddress: session.startAddress,
        endLat: session.endLat,
        endLng: session.endLng,
        endAddress: session.endAddress,
        totalDistance: Number(session.totalDistance),
        totalDuration: session.totalDuration,
        status: session.status,
        autoEndReason: session.autoEndReason,
        createdAt: session.createdAt instanceof Date ? session.createdAt.toISOString() : session.createdAt,
        updatedAt: session.updatedAt instanceof Date ? session.updatedAt.toISOString() : session.updatedAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error starting route session:', error);
    return NextResponse.json({ error: 'Failed to start route session' }, { status: 500 });
  }
}
