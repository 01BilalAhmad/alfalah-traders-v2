import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { ensureTallyTables } from '@/lib/tally-migrations';

// POST /api/tally/[id]/void
// Body: { voidReason }
// Admin-only: marks a tally as voided (will be excluded from default reports).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: tallyId } = await params;
    const body = await request.json();
    const { voidReason } = body;

    if (!voidReason || !String(voidReason).trim()) {
      return NextResponse.json({ error: 'voidReason is required' }, { status: 400 });
    }

    const pool = getPool();
    await ensureTallyTables();

    const tallyRes = await pool.query(
      `SELECT st.id, st."voided", s.name AS "shopName"
       FROM "ShopTally" st
       LEFT JOIN "Shop" s ON st."shopId" = s.id
       WHERE st.id = $1`,
      [tallyId]
    );
    if (tallyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Tally not found' }, { status: 404 });
    }
    if (tallyRes.rows[0].voided) {
      return NextResponse.json({ error: 'Tally is already voided' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await pool.query(
      `UPDATE "ShopTally"
          SET "voided" = true,
              "voidReason" = $1,
              "voidedBy" = $2,
              "voidedAt" = $3
        WHERE id = $4`,
      [String(voidReason).trim().slice(0, 500), auth.userId, now, tallyId]
    );

    // Audit log
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "newValue", description)
         VALUES ($1, 'void', 'shopTally', $2, $3, $4)`,
        [
          auditId,
          tallyId,
          JSON.stringify({ voidReason, voidedBy: auth.userId }),
          `Tally ${tallyId} for ${tallyRes.rows[0].shopName} voided: ${String(voidReason).trim()}`,
        ]
      );
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      tallyId,
      voided: true,
      voidedAt: now,
    });
  } catch (error) {
    console.error('[Tally Void API] error:', error);
    return NextResponse.json({ error: 'Failed to void tally' }, { status: 500 });
  }
}
