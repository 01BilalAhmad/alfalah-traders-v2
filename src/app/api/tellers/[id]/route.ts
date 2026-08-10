import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/pg';
import { requireAdmin } from '@/lib/auth-guard';

// ─── Ensure tables exist (mirrors /api/tellers) ───────────────────
async function ensureTables(pool: any) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "ShopTally" (
      "id" TEXT NOT NULL,
      "shopId" TEXT NOT NULL,
      "talliedBy" TEXT NOT NULL,
      "tallyDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "systemBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "shopBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "difference" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'verified',
      "notes" TEXT,
      "orderbookerId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ShopTally_pkey" PRIMARY KEY ("id")
    );
  `);
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_shopId_idx" ON "ShopTally"("shopId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_talliedBy_idx" ON "ShopTally"("talliedBy")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_orderbookerId_idx" ON "ShopTally"("orderbookerId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_tallyDate_idx" ON "ShopTally"("tallyDate")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_status_idx" ON "ShopTally"("status")`);
  } catch { /* ignore */ }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "TellerAssignment" (
      "id" TEXT NOT NULL,
      "tellerId" TEXT NOT NULL,
      "orderbookerId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TellerAssignment_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "TellerAssignment_tellerId_orderbookerId_key" UNIQUE ("tellerId", "orderbookerId")
    );
  `);
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS "TellerAssignment_tellerId_idx" ON "TellerAssignment"("tellerId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "TellerAssignment_orderbookerId_idx" ON "TellerAssignment"("orderbookerId")`);
  } catch { /* ignore */ }
}

// GET /api/tellers/[id] — fetch single teller with assignments (admin only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { id } = await params;
    const pool = getPool();
    await ensureTables(pool);

    const tellerRes = await pool.query(
      `SELECT id, username, name, phone, role, status, "createdAt"
       FROM "User"
       WHERE id = $1 AND role = 'teller'`,
      [id]
    );
    if (tellerRes.rows.length === 0) {
      return NextResponse.json({ error: 'Teller not found' }, { status: 404 });
    }
    const teller = tellerRes.rows[0];

    const assignRes = await pool.query(
      `SELECT ta."orderbookerId", u.name AS "orderbookerName", u.username AS "orderbookerUsername", u.status AS "orderbookerStatus"
       FROM "TellerAssignment" ta
       JOIN "User" u ON ta."orderbookerId" = u.id
       WHERE ta."tellerId" = $1
       ORDER BY u.name ASC`,
      [id]
    );

    return NextResponse.json({
      id: teller.id,
      username: teller.username,
      name: teller.name,
      phone: teller.phone,
      role: teller.role,
      status: teller.status,
      createdAt: teller.createdAt instanceof Date ? teller.createdAt.toISOString() : teller.createdAt,
      assignedOBs: assignRes.rows.map((r: any) => ({
        id: r.orderbookerId,
        orderbookerId: r.orderbookerId,
        orderbookerName: r.orderbookerName,
        orderbookerUsername: r.orderbookerUsername,
        orderbookerStatus: r.orderbookerStatus,
      })),
    });
  } catch (error) {
    console.error('[Tellers API] GET [id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch teller' }, { status: 500 });
  }
}

// PATCH /api/tellers/[id] — update teller (admin only)
// Body: { name?, phone?, password?, status?, assignedOBIds? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, phone, password, status, assignedOBIds } = body;

    const pool = getPool();
    await ensureTables(pool);

    // Verify teller exists
    const existingRes = await pool.query(
      `SELECT id, username, name, phone, status FROM "User" WHERE id = $1 AND role = 'teller'`,
      [id]
    );
    if (existingRes.rows.length === 0) {
      return NextResponse.json({ error: 'Teller not found' }, { status: 404 });
    }
    const existing = existingRes.rows[0];

    const setClauses: string[] = [];
    const updateParams: any[] = [];
    let paramIdx = 1;

    if (name !== undefined) {
      if (!String(name).trim()) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      setClauses.push(`name = $${paramIdx++}`);
      updateParams.push(String(name).trim());
    }
    if (phone !== undefined) {
      setClauses.push(`phone = $${paramIdx++}`);
      updateParams.push(phone ? String(phone).trim() : null);
    }
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
      }
      setClauses.push(`status = $${paramIdx++}`);
      updateParams.push(status);
    }
    if (password) {
      const bcrypt = await import('bcryptjs');
      const hashed = await bcrypt.hash(password, 10);
      setClauses.push(`password = $${paramIdx++}`);
      updateParams.push(hashed);
    }

    setClauses.push(`"updatedAt" = NOW()`);

    updateParams.push(id);
    await pool.query(
      `UPDATE "User" SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      updateParams
    );

    // Sync assigned OBs if provided
    if (Array.isArray(assignedOBIds)) {
      const newObIds = assignedOBIds.filter(Boolean);

      // Validate the new IDs
      if (newObIds.length > 0) {
        const validObsRes = await pool.query(
          `SELECT id FROM "User" WHERE id = ANY($1::text[]) AND role = 'orderbooker'`,
          [newObIds]
        );
        const validIds = new Set(validObsRes.rows.map((r: any) => r.id));
        for (const obId of newObIds) {
          if (!validIds.has(obId)) {
            return NextResponse.json({ error: `Invalid orderbooker ID: ${obId}` }, { status: 400 });
          }
        }
      }

      // Delete existing assignments, then insert fresh ones
      await pool.query(`DELETE FROM "TellerAssignment" WHERE "tellerId" = $1`, [id]);

      if (newObIds.length > 0) {
        const now = new Date().toISOString();
        const valuesClauses: string[] = [];
        const insParams: any[] = [];
        for (let i = 0; i < newObIds.length; i++) {
          const assignId = `ta_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}_${i}`;
          const base = insParams.length;
          valuesClauses.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
          insParams.push(assignId, id, newObIds[i], now);
        }
        await pool.query(
          `INSERT INTO "TellerAssignment" (id, "tellerId", "orderbookerId", "createdAt")
           VALUES ${valuesClauses.join(', ')}
           ON CONFLICT ("tellerId", "orderbookerId") DO NOTHING`,
          insParams
        );
      }
    }

    // Audit log (best-effort)
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "oldValue", "newValue", description)
         VALUES ($1, 'edit', 'user', $2, $3, $4, $5)`,
        [
          auditId,
          id,
          JSON.stringify({ name: existing.name, phone: existing.phone, status: existing.status }),
          JSON.stringify({ name, phone, status, passwordChanged: !!password, assignedOBIds }),
          `Updated teller: ${existing.name}`,
        ]
      );
    } catch { /* non-blocking */ }

    // Return updated teller (re-fetch)
    const updatedRes = await pool.query(
      `SELECT id, username, name, phone, role, status, "createdAt"
       FROM "User" WHERE id = $1`,
      [id]
    );
    const updated = updatedRes.rows[0] || {};
    return NextResponse.json({
      id: updated.id,
      username: updated.username,
      name: updated.name,
      phone: updated.phone,
      role: updated.role,
      status: updated.status,
      createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
    });
  } catch (error) {
    console.error('[Tellers API] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update teller' }, { status: 500 });
  }
}

// DELETE /api/tellers/[id] — delete teller + assignments (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { id } = await params;
    const pool = getPool();
    await ensureTables(pool);

    // Verify teller exists
    const existingRes = await pool.query(
      `SELECT id, name, username FROM "User" WHERE id = $1 AND role = 'teller'`,
      [id]
    );
    if (existingRes.rows.length === 0) {
      return NextResponse.json({ error: 'Teller not found' }, { status: 404 });
    }
    const existing = existingRes.rows[0];

    // Delete assignments first
    await pool.query(`DELETE FROM "TellerAssignment" WHERE "tellerId" = $1`, [id]);

    // Delete the user account
    await pool.query(`DELETE FROM "User" WHERE id = $1`, [id]);

    // Audit log (best-effort)
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "oldValue", description)
         VALUES ($1, 'delete', 'user', $2, $3, $4)`,
        [
          auditId,
          id,
          JSON.stringify({ username: existing.username, name: existing.name, role: 'teller' }),
          `Deleted teller: ${existing.name}`,
        ]
      );
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true, message: `Teller ${existing.name} deleted` });
  } catch (error) {
    console.error('[Tellers API] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete teller' }, { status: 500 });
  }
}
