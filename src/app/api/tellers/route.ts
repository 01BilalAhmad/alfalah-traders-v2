import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/pg';
import { requireAdmin } from '@/lib/auth-guard';

// ─── Ensure tables exist ──────────────────────────────────────────
// Auto-creates ShopTally + TellerAssignment tables on first call,
// following the same pattern used by the Areas API.
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

// GET /api/tellers — list all tellers with assigned OBs (admin only)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const pool = getPool();
    await ensureTables(pool);

    // Fetch all tellers
    const tellerRes = await pool.query(
      `SELECT id, username, name, phone, status, "createdAt"
       FROM "User"
       WHERE role = 'teller'
       ORDER BY name ASC`
    );

    // Fetch all teller-OB assignments in one query
    const assignRes = await pool.query(
      `SELECT ta."tellerId", ta."orderbookerId", u.name AS "orderbookerName", u.username AS "orderbookerUsername", u.status AS "orderbookerStatus"
       FROM "TellerAssignment" ta
       JOIN "User" u ON ta."orderbookerId" = u.id
       ORDER BY u.name ASC`
    );

    // Group assignments by tellerId
    const assignMap: Record<string, { id: string; orderbookerId: string; orderbookerName: string; orderbookerUsername: string; orderbookerStatus: string }[]> = {};
    for (const row of assignRes.rows) {
      if (!assignMap[row.tellerId]) assignMap[row.tellerId] = [];
      assignMap[row.tellerId].push({
        id: row.orderbookerId, // alias for backwards compat
        orderbookerId: row.orderbookerId,
        orderbookerName: row.orderbookerName,
        orderbookerUsername: row.orderbookerUsername,
        orderbookerStatus: row.orderbookerStatus,
      });
    }

    const tellers = tellerRes.rows.map((t: any) => ({
      id: t.id,
      username: t.username,
      name: t.name,
      phone: t.phone,
      status: t.status,
      assignedOBs: assignMap[t.id] || [],
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    }));

    return NextResponse.json({ tellers });
  } catch (error) {
    console.error('[Tellers API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch tellers' }, { status: 500 });
  }
}

// POST /api/tellers — create new teller (admin only)
// Body: { username, password, name, phone, assignedOBIds: string[] }
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const { username, password, name, phone, assignedOBIds } = body;

    if (!username || !password || !name) {
      return NextResponse.json({ error: 'Username, password, and name are required' }, { status: 400 });
    }

    const normalizedUsername = username.trim().toLowerCase();
    if (normalizedUsername.length < 2) {
      return NextResponse.json({ error: 'Username must be at least 2 characters' }, { status: 400 });
    }
    if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
      return NextResponse.json({ error: 'Username can only contain lowercase letters, numbers, and underscores' }, { status: 400 });
    }

    const pool = getPool();
    await ensureTables(pool);

    // Check for duplicate username
    const existingRes = await pool.query(
      `SELECT id, name FROM "User" WHERE LOWER(username) = LOWER($1)`,
      [normalizedUsername]
    );
    if (existingRes.rows.length > 0) {
      return NextResponse.json({ error: `Username already exists (used by ${existingRes.rows[0].name})` }, { status: 409 });
    }

    // Validate assigned OB IDs (must be active orderbookers)
    const obIds: string[] = Array.isArray(assignedOBIds) ? assignedOBIds.filter(Boolean) : [];
    if (obIds.length > 0) {
      const validObsRes = await pool.query(
        `SELECT id FROM "User" WHERE id = ANY($1::text[]) AND role = 'orderbooker'`,
        [obIds]
      );
      const validIds = new Set(validObsRes.rows.map((r: any) => r.id));
      for (const id of obIds) {
        if (!validIds.has(id)) {
          return NextResponse.json({ error: `Invalid orderbooker ID: ${id}` }, { status: 400 });
        }
      }
    }

    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    const userId = `teller_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO "User" (id, username, password, name, phone, role, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'teller', 'active', $6, $7)`,
      [userId, normalizedUsername, hashedPassword, name.trim(), phone ? String(phone).trim() : null, now, now]
    );

    // Create TellerAssignment records for each assigned OB
    if (obIds.length > 0) {
      const valuesClauses: string[] = [];
      const params: any[] = [];
      for (let i = 0; i < obIds.length; i++) {
        const assignId = `ta_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}_${i}`;
        const base = params.length;
        valuesClauses.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        params.push(assignId, userId, obIds[i], now);
      }
      await pool.query(
        `INSERT INTO "TellerAssignment" (id, "tellerId", "orderbookerId", "createdAt")
         VALUES ${valuesClauses.join(', ')}
         ON CONFLICT ("tellerId", "orderbookerId") DO NOTHING`,
        params
      );
    }

    // Audit log (best-effort)
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "newValue", description)
         VALUES ($1, 'create', 'user', $2, $3, $4)`,
        [auditId, userId, JSON.stringify({ username: normalizedUsername, name, phone, role: 'teller', assignedOBIds: obIds }), `Created teller: ${name}`]
      );
    } catch { /* non-blocking */ }

    return NextResponse.json({
      id: userId,
      username: normalizedUsername,
      name: name.trim(),
      phone: phone ? String(phone).trim() : null,
      role: 'teller',
      status: 'active',
      assignedOBIds: obIds,
    }, { status: 201 });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }
    console.error('[Tellers API] POST error:', error);
    return NextResponse.json({ error: 'Failed to create teller' }, { status: 500 });
  }
}
