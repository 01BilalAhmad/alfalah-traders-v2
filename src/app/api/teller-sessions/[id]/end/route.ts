import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { ensureTallyTables } from '@/lib/tally-migrations';

// POST /api/teller-sessions/[id]/end
// Body: { endGpsLat?, endGpsLng?, endGpsAddress?, notes? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id: sessionId } = await params;
    const body = await request.json();
    const { endGpsLat, endGpsLng, endGpsAddress, notes } = body;

    const pool = getPool();
    await ensureTallyTables();

    // Verify session exists and belongs to user (or admin)
    const sessRes = await pool.query(
      `SELECT id, "tellerId", status FROM "TellerSession" WHERE id = $1`,
      [sessionId]
    );
    if (sessRes.rows.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const sess = sessRes.rows[0];
    if (sess.tellerId !== auth.userId && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized to end this session' }, { status: 403 });
    }
    if (sess.status !== 'active') {
      return NextResponse.json({ error: 'Session is already ended' }, { status: 400 });
    }

    await pool.query(
      `UPDATE "TellerSession"
          SET status = 'ended',
              "endTime" = NOW(),
              "endGpsLat" = $1,
              "endGpsLng" = $2,
              "endGpsAddress" = $3,
              notes = COALESCE($4, notes)
        WHERE id = $5`,
      [
        endGpsLat != null && !isNaN(Number(endGpsLat)) ? Number(endGpsLat) : null,
        endGpsLng != null && !isNaN(Number(endGpsLng)) ? Number(endGpsLng) : null,
        endGpsAddress ? String(endGpsAddress).slice(0, 500) : null,
        notes ? String(notes).slice(0, 1000) : null,
        sessionId,
      ]
    );

    return NextResponse.json({
      success: true,
      sessionId,
      status: 'ended',
      endTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Teller Sessions End API] error:', error);
    return NextResponse.json({ error: 'Failed to end session' }, { status: 500 });
  }
}
