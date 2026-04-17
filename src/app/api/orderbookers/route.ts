import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';

const { Client } = pg;

// GET /api/orderbookers - List all orderbookers with their shop counts and balances
export async function GET() {
  let client;
  try {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // Get all orderbookers with active shop counts
    const obRes = await client.query(
      `SELECT u.id, u.username, u.name, u.phone, u.status, u."createdAt",
              COUNT(s.id) AS "activeShopCount"
       FROM "User" u
       LEFT JOIN "Shop" s ON u.id = s."orderbookerId" AND s.status = 'active'
       WHERE u.role = 'orderbooker'
       GROUP BY u.id
       ORDER BY u.name ASC`
    );
    const orderbookers: any[] = obRes.rows;

    // Get total outstanding for each orderbooker
    const orderbookersWithBalance = await Promise.all(
      orderbookers.map(async (ob: any) => {
        const balanceRes = await client!.query(
          `SELECT COALESCE(SUM(balance), 0) AS total FROM "Shop" WHERE "orderbookerId" = $1 AND status = 'active'`,
          [ob.id]
        );
        const totalOutstanding = Number(balanceRes.rows[0].total);
        const activeShopCount = parseInt(ob.activeShopCount, 10);
        return {
          id: ob.id,
          username: ob.username,
          name: ob.name,
          phone: ob.phone,
          status: ob.status,
          createdAt: ob.createdAt instanceof Date ? ob.createdAt.toISOString() : ob.createdAt,
          totalShops: activeShopCount,
          totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        };
      })
    );

    await client.end();
    return NextResponse.json(orderbookersWithBalance);
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error fetching orderbookers:', error);
    return NextResponse.json({ error: 'Failed to fetch orderbookers' }, { status: 500 });
  }
}

// POST /api/orderbookers - Create a new orderbooker
export async function POST(request: NextRequest) {
  let client;
  try {
    const { username, password, name, phone } = await request.json();

    if (!username || !password || !name) {
      return NextResponse.json({ error: 'Username, password, and name are required' }, { status: 400 });
    }

    // Normalize username to lowercase
    const normalizedUsername = username.trim().toLowerCase();

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // Check if username already exists (case-insensitive)
    const existingRes = await client.query(
      `SELECT id, name FROM "User" WHERE LOWER(username) = LOWER($1)`,
      [normalizedUsername]
    );
    if (existingRes.rows.length > 0) {
      await client.end();
      return NextResponse.json({ error: `Username already exists (used by ${existingRes.rows[0].name})` }, { status: 409 });
    }

    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    const obRes = await client.query(
      `INSERT INTO "User" (username, password, name, phone, role)
       VALUES ($1, $2, $3, $4, 'orderbooker')
       RETURNING id, username, name, phone, role, status, "createdAt", "updatedAt"`,
      [normalizedUsername, hashedPassword, name, phone || null]
    );

    const orderbooker = obRes.rows[0];

    // Audit log (best-effort)
    try {
      await client.query(
        `INSERT INTO "AuditLog" (action, "entityType", "entityId", "newValue", description)
         VALUES ('create', 'user', $1, $2, $3)`,
        [orderbooker.id, JSON.stringify({ username: normalizedUsername, name, phone, role: 'orderbooker' }), `Created orderbooker: ${name}`]
      );
    } catch { /* non-blocking */ }

    await client.end();
    return NextResponse.json(orderbooker, { status: 201 });
  } catch (error: unknown) {
    if (client) await client.end().catch(() => {});
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }
    console.error('Error creating orderbooker:', error);
    return NextResponse.json({ error: 'Failed to create orderbooker' }, { status: 500 });
  }
}

// PATCH /api/orderbookers - Update orderbooker (soft delete = status change)
export async function PATCH(request: NextRequest) {
  let client;
  try {
    const { id, name, phone, status, password } = await request.json();

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const existingRes = await client.query('SELECT * FROM "User" WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'Orderbooker not found' }, { status: 404 });
    }
    const existing = existingRes.rows[0];

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name) { setClauses.push(`name = $${paramIndex++}`); params.push(name); }
    if (phone !== undefined) { setClauses.push(`phone = $${paramIndex++}`); params.push(phone); }
    if (status) { setClauses.push(`status = $${paramIndex++}`); params.push(status); }
    if (password) {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);
      setClauses.push(`password = $${paramIndex++}`);
      params.push(hashedPassword);
    }

    if (setClauses.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    params.push(id);
    const updatedRes = await client.query(
      `UPDATE "User" SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, username, name, phone, role, status, "createdAt", "updatedAt"`,
      params
    );
    const updated = updatedRes.rows[0];

    // Audit log (best-effort)
    try {
      await client.query(
        `INSERT INTO "AuditLog" (action, "entityType", "entityId", "oldValue", "newValue", description)
         VALUES ('edit', 'user', $1, $2, $3, $4)`,
        [id, JSON.stringify({ name: existing.name, phone: existing.phone, status: existing.status }), JSON.stringify({ name, phone, status }), `Updated orderbooker: ${existing.name}`]
      );
    } catch { /* non-blocking */ }

    await client.end();
    return NextResponse.json(updated);
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error updating orderbooker:', error);
    return NextResponse.json({ error: 'Failed to update orderbooker' }, { status: 500 });
  }
}
