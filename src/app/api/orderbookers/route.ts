import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/pg';

// GET /api/orderbookers - List all orderbookers with their shop counts, balances, and companies
export async function GET() {
  try {
    const pool = getPool();

    // Get all orderbookers with primary company and shop stats
    const obRes = await pool.query(
      `SELECT u.id, u.username, u.name, u.phone, u.status, u."createdAt", u."allRoutesEnabled", u."companyId",
              c.name AS "companyName",
              COUNT(s.id) AS "activeShopCount",
              COALESCE(SUM(s.balance), 0) AS "totalOutstanding"
       FROM "User" u
       LEFT JOIN "Shop" s ON u.id = s."orderbookerId" AND s.status = 'active'
       LEFT JOIN "Company" c ON u."companyId" = c.id
       WHERE u.role = 'orderbooker'
       GROUP BY u.id, c.name
       ORDER BY u.name ASC`
    );

    // Get all UserCompany assignments for all orderbookers in one query
    const ucRes = await pool.query(
      `SELECT uc."userId", uc."companyId", uc."isPrimary", c.name AS "companyName"
       FROM "UserCompany" uc
       JOIN "Company" c ON uc."companyId" = c.id
       ORDER BY uc."isPrimary" DESC, c.name ASC`
    );

    // Build a map: userId -> companies[]
    const userCompaniesMap: Record<string, { companyId: string; companyName: string; isPrimary: boolean }[]> = {};
    for (const row of ucRes.rows) {
      if (!userCompaniesMap[row.userId]) userCompaniesMap[row.userId] = [];
      userCompaniesMap[row.userId].push({
        companyId: row.companyId,
        companyName: row.companyName,
        isPrimary: row.isPrimary,
      });
    }

    const orderbookersWithBalance = obRes.rows.map((ob: any) => ({
      id: ob.id,
      username: ob.username,
      name: ob.name,
      phone: ob.phone,
      status: ob.status,
      allRoutesEnabled: ob.allRoutesEnabled ?? false,
      companyId: ob.companyId || null,
      companyName: ob.companyName || null,
      companies: userCompaniesMap[ob.id] || [],
      createdAt: ob.createdAt instanceof Date ? ob.createdAt.toISOString() : ob.createdAt,
      totalShops: parseInt(ob.activeShopCount, 10),
      totalOutstanding: Math.round(Number(ob.totalOutstanding) * 100) / 100,
    }));

    return NextResponse.json(orderbookersWithBalance);
  } catch (error) {
    console.error('Error fetching orderbookers:', error);
    return NextResponse.json({ error: 'Failed to fetch orderbookers' }, { status: 500 });
  }
}

// POST /api/orderbookers - Create a new orderbooker
export async function POST(request: NextRequest) {
  try {
    const { username, password, name, phone, companyId, companyIds } = await request.json();

    if (!username || !password || !name) {
      return NextResponse.json({ error: 'Username, password, and name are required' }, { status: 400 });
    }

    // Normalize username to lowercase
    const normalizedUsername = username.trim().toLowerCase();

    const pool = getPool();

    // Check if username already exists (case-insensitive)
    const existingRes = await pool.query(
      `SELECT id, name FROM "User" WHERE LOWER(username) = LOWER($1)`,
      [normalizedUsername]
    );
    if (existingRes.rows.length > 0) {
      return NextResponse.json({ error: `Username already exists (used by ${existingRes.rows[0].name})` }, { status: 409 });
    }

    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine primary company: use companyIds[0] if provided, else companyId, else null
    const effectiveCompanyIds: string[] = companyIds?.length > 0 ? companyIds : (companyId ? [companyId] : []);
    const primaryCompanyId = effectiveCompanyIds.length > 0 ? effectiveCompanyIds[0] : null;

    const userId = `user_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();
    const obRes = await pool.query(
      `INSERT INTO "User" (id, username, password, name, phone, role, status, "companyId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'orderbooker', 'active', $6, $7, $8)
       RETURNING id, username, name, phone, role, status, "companyId", "createdAt", "updatedAt"`,
      [userId, normalizedUsername, hashedPassword, name, phone || null, primaryCompanyId, now, now]
    );

    const orderbooker = obRes.rows[0];

    // Create UserCompany records for all assigned companies (batch insert to avoid N+1)
    if (effectiveCompanyIds.length > 0) {
      const ucValuesClauses: string[] = [];
      const ucParams: any[] = [];
      for (let i = 0; i < effectiveCompanyIds.length; i++) {
        const ucId = `uc_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}_${i}`;
        const paramBase = ucParams.length;
        ucValuesClauses.push(
          `($${paramBase + 1}, $${paramBase + 2}, $${paramBase + 3}, $${paramBase + 4}, $${paramBase + 5}, $${paramBase + 6})`
        );
        ucParams.push(ucId, userId, effectiveCompanyIds[i], i === 0, now, now);
      }
      await pool.query(
        `INSERT INTO "UserCompany" (id, "userId", "companyId", "isPrimary", "createdAt", "updatedAt")
         VALUES ${ucValuesClauses.join(', ')}`,
        ucParams
      );
    }

    // Audit log (best-effort)
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "newValue", description)
         VALUES ($1, 'create', 'user', $2, $3, $4)`,
        [auditId, orderbooker.id, JSON.stringify({ username: normalizedUsername, name, phone, role: 'orderbooker', companyIds: effectiveCompanyIds }), `Created orderbooker: ${name}`]
      );
    } catch { /* non-blocking */ }

    return NextResponse.json(orderbooker, { status: 201 });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }
    console.error('Error creating orderbooker:', error);
    return NextResponse.json({ error: 'Failed to create orderbooker' }, { status: 500 });
  }
}

// PATCH /api/orderbookers - Update orderbooker (including multi-company assignment)
export async function PATCH(request: NextRequest) {
  try {
    const { id, name, username, phone, status, password, allRoutesEnabled, companyId, companyIds } = await request.json();

    const pool = getPool();

    const existingRes = await pool.query('SELECT * FROM "User" WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return NextResponse.json({ error: 'Orderbooker not found' }, { status: 404 });
    }
    const existing = existingRes.rows[0];

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name) { setClauses.push(`name = $${paramIndex++}`); params.push(name); }
    if (username) {
      // Check if the new username is already taken by another user
      const normalizedUsername = username.trim().toLowerCase();
      const duplicateRes = await pool.query(
        `SELECT id, name FROM "User" WHERE LOWER(username) = LOWER($1) AND id != $2`,
        [normalizedUsername, id]
      );
      if (duplicateRes.rows.length > 0) {
        return NextResponse.json({ error: `Username already exists (used by ${duplicateRes.rows[0].name})` }, { status: 409 });
      }
      setClauses.push(`username = $${paramIndex++}`);
      params.push(normalizedUsername);
    }
    if (phone !== undefined) { setClauses.push(`phone = $${paramIndex++}`); params.push(phone); }
    if (status) { setClauses.push(`status = $${paramIndex++}`); params.push(status); }
    if (password) {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);
      setClauses.push(`password = $${paramIndex++}`);
      params.push(hashedPassword);
    }
    if (allRoutesEnabled !== undefined) { setClauses.push(`"allRoutesEnabled" = $${paramIndex++}`); params.push(allRoutesEnabled); }

    // Handle company assignment
    const effectiveCompanyIds: string[] | null = companyIds !== undefined
      ? (Array.isArray(companyIds) ? companyIds : [])
      : null;

    if (effectiveCompanyIds !== null) {
      // Multi-company update: set primary companyId on User table
      const primaryCompanyId = effectiveCompanyIds.length > 0 ? effectiveCompanyIds[0] : null;
      setClauses.push(`"companyId" = $${paramIndex++}`);
      params.push(primaryCompanyId);
    } else if (companyId !== undefined) {
      // Legacy single-company update
      setClauses.push(`"companyId" = $${paramIndex++}`);
      params.push(companyId || null);
    }

    // Always update updatedAt timestamp
    setClauses.push(`"updatedAt" = $${paramIndex++}`);
    params.push(new Date().toISOString());

    if (setClauses.length === 0 && effectiveCompanyIds === null) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    params.push(id);
    const updatedRes = await pool.query(
      `UPDATE "User" SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, username, name, phone, role, status, "allRoutesEnabled", "companyId", "createdAt", "updatedAt"`,
      params
    );
    const updated = updatedRes.rows[0];

    // Sync UserCompany records if companyIds was provided
    if (effectiveCompanyIds !== null) {
      // Delete existing UserCompany records for this user
      await pool.query(`DELETE FROM "UserCompany" WHERE "userId" = $1`, [id]);

      // Insert new UserCompany records (batch insert to avoid N+1)
      if (effectiveCompanyIds.length > 0) {
        const now = new Date().toISOString();
        const ucValuesClauses: string[] = [];
        const ucParams: any[] = [];
        for (let i = 0; i < effectiveCompanyIds.length; i++) {
          const ucId = `uc_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}_${i}`;
          const paramBase = ucParams.length;
          ucValuesClauses.push(
            `($${paramBase + 1}, $${paramBase + 2}, $${paramBase + 3}, $${paramBase + 4}, $${paramBase + 5}, $${paramBase + 6})`
          );
          ucParams.push(ucId, id, effectiveCompanyIds[i], i === 0, now, now);
        }
        await pool.query(
          `INSERT INTO "UserCompany" (id, "userId", "companyId", "isPrimary", "createdAt", "updatedAt")
           VALUES ${ucValuesClauses.join(', ')}`,
          ucParams
        );
      }
    }

    // Audit log (best-effort)
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "oldValue", "newValue", description)
         VALUES ($1, 'edit', 'user', $2, $3, $4, $5)`,
        [auditId, id, JSON.stringify({ name: existing.name, phone: existing.phone, status: existing.status }), JSON.stringify({ name, phone, status, companyIds: effectiveCompanyIds }), `Updated orderbooker: ${existing.name}`]
      );
    } catch { /* non-blocking */ }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating orderbooker:', error);
    return NextResponse.json({ error: 'Failed to update orderbooker' }, { status: 500 });
  }
}
