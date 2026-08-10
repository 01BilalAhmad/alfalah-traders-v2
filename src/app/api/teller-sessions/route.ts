import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { ensureTallyTables } from '@/lib/tally-migrations';

// GET /api/teller-sessions?status=active&dateFrom=&dateTo=&tellerId=
// - admin: sees all sessions
// - teller: sees only their own
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    const isTeller = auth.user?.role === 'teller';
    const isAdmin = auth.user?.role === 'admin';
    if (!isTeller && !isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const pool = getPool();
    await ensureTallyTables();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const tellerId = searchParams.get('tellerId');

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (isTeller) {
      conditions.push(`ts."tellerId" = $${idx++}`);
      params.push(auth.userId);
    } else if (tellerId) {
      conditions.push(`ts."tellerId" = $${idx++}`);
      params.push(tellerId);
    }
    if (status && ['active', 'ended'].includes(status)) {
      conditions.push(`ts."status" = $${idx++}`);
      params.push(status);
    }
    if (dateFrom) {
      conditions.push(`ts."startTime" >= $${idx++}`);
      params.push(new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(`ts."startTime" <= $${idx++}`);
      params.push(end.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res = await pool.query(
      `SELECT ts.id, ts."tellerId", ts."startTime", ts."endTime",
              ts."startGpsLat", ts."startGpsLng", ts."startGpsAddress",
              ts."endGpsLat", ts."endGpsLng", ts."endGpsAddress",
              ts.area, ts.notes,
              ts."talliesCount", ts."discrepanciesCount", ts.status,
              ts."createdAt",
              tu.name AS "tellerName", tu.username AS "tellerUsername"
       FROM "TellerSession" ts
       LEFT JOIN "User" tu ON ts."tellerId" = tu.id
       ${whereClause}
       ORDER BY ts."startTime" DESC
       LIMIT 500`,
      params
    );

    const sessions = res.rows.map((r: any) => ({
      id: r.id,
      tellerId: r.tellerId,
      tellerName: r.tellerName,
      tellerUsername: r.tellerUsername,
      startTime: r.startTime instanceof Date ? r.startTime.toISOString() : r.startTime,
      endTime: r.endTime instanceof Date ? r.endTime.toISOString() : r.endTime,
      startGpsLat: r.startGpsLat != null ? Number(r.startGpsLat) : null,
      startGpsLng: r.startGpsLng != null ? Number(r.startGpsLng) : null,
      startGpsAddress: r.startGpsAddress,
      endGpsLat: r.endGpsLat != null ? Number(r.endGpsLat) : null,
      endGpsLng: r.endGpsLng != null ? Number(r.endGpsLng) : null,
      endGpsAddress: r.endGpsAddress,
      area: r.area,
      notes: r.notes,
      talliesCount: r.talliesCount,
      discrepanciesCount: r.discrepanciesCount,
      status: r.status,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('[Teller Sessions API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

// POST /api/teller-sessions — start a new session
// Body: { startGpsLat?, startGpsLng?, startGpsAddress?, area?, notes? }
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    const isTeller = auth.user?.role === 'teller';
    const isAdmin = auth.user?.role === 'admin';
    if (!isTeller && !isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { startGpsLat, startGpsLng, startGpsAddress, area, notes } = body;

    const pool = getPool();
    await ensureTallyTables();

    // End any active session for this teller first (only one active at a time)
    await pool.query(
      `UPDATE "TellerSession"
          SET status = 'ended',
              "endTime" = NOW()
        WHERE "tellerId" = $1 AND status = 'active'`,
      [auth.userId]
    );

    const id = `sess_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
    const insRes = await pool.query(
      `INSERT INTO "TellerSession"
        (id, "tellerId", "startTime", "startGpsLat", "startGpsLng", "startGpsAddress",
         area, notes, status, "createdAt")
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, 'active', NOW())
       RETURNING *`,
      [
        id,
        auth.userId,
        startGpsLat != null && !isNaN(Number(startGpsLat)) ? Number(startGpsLat) : null,
        startGpsLng != null && !isNaN(Number(startGpsLng)) ? Number(startGpsLng) : null,
        startGpsAddress ? String(startGpsAddress).slice(0, 500) : null,
        area ? String(area).slice(0, 200) : null,
        notes ? String(notes).slice(0, 1000) : null,
      ]
    );

    const inserted = insRes.rows[0];
    return NextResponse.json({
      id: inserted.id,
      tellerId: inserted.tellerId,
      startTime: inserted.startTime instanceof Date ? inserted.startTime.toISOString() : inserted.startTime,
      area: inserted.area,
      status: inserted.status,
    }, { status: 201 });
  } catch (error) {
    console.error('[Teller Sessions API] POST error:', error);
    return NextResponse.json({ error: 'Failed to start session' }, { status: 500 });
  }
}
