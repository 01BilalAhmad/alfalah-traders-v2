import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';

const { Client } = pg;

// GET /api/shops?orderbookerId=xxx&routeDay=xxx&search=xxx
export async function GET(request: NextRequest) {
  let client;
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const routeDay = searchParams.get('routeDay');
    const search = searchParams.get('search');
    const includeInactive = searchParams.get('includeInactive') === 'true';

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (orderbookerId) {
      conditions.push(`s."orderbookerId" = $${paramIndex++}`);
      params.push(orderbookerId);
    }
    if (routeDay) {
      conditions.push(`s."routeDay" = $${paramIndex++}`);
      params.push(routeDay);
    }
    if (!includeInactive) {
      conditions.push(`s.status = $${paramIndex++}`);
      params.push('active');
    }
    if (search) {
      conditions.push(`(s.name ILIKE $${paramIndex} OR s.area ILIKE $${paramIndex} OR s."ownerName" ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const shopRes = await client.query(
      `SELECT s.*, u.id AS "ob_id", u.name AS "ob_name"
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       ${whereClause}
       ORDER BY s.name ASC`,
      params
    );

    // Map to match previous Prisma output shape
    const shops = shopRes.rows.map((s: any) => ({
      id: s.id,
      name: s.name,
      ownerName: s.ownerName,
      area: s.area,
      address: s.address,
      phone: s.phone,
      routeDay: s.routeDay,
      orderbookerId: s.orderbookerId,
      balance: Number(s.balance),
      creditLimit: Number(s.creditLimit),
      status: s.status,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
      orderbooker: s.ob_id ? { id: s.ob_id, name: s.ob_name } : null,
    }));

    await client.end();
    return NextResponse.json(shops);
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error fetching shops:', error);
    return NextResponse.json({ error: 'Failed to fetch shops' }, { status: 500 });
  }
}

// POST /api/shops - Create a new shop
export async function POST(request: NextRequest) {
  let client;
  try {
    const { name, ownerName, area, address, phone, routeDay, orderbookerId, creditLimit } = await request.json();

    if (!name || !routeDay || !orderbookerId) {
      return NextResponse.json({ error: 'Name, route day, and orderbooker are required' }, { status: 400 });
    }

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const shopRes = await client.query(
      `INSERT INTO "Shop" (name, "ownerName", area, address, phone, "routeDay", "orderbookerId", "creditLimit")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, ownerName || null, area || null, address || null, phone || null, routeDay, orderbookerId, creditLimit && creditLimit > 0 ? creditLimit : 0]
    );

    const shop = shopRes.rows[0];

    // Audit log (best-effort)
    try {
      await client.query(
        `INSERT INTO "AuditLog" (action, "entityType", "entityId", "newValue", description)
         VALUES ('create', 'shop', $1, $2, $3)`,
        [shop.id, JSON.stringify({ name, routeDay, orderbookerId }), `Created shop: ${name}`]
      );
    } catch { /* non-blocking */ }

    await client.end();
    return NextResponse.json(shop, { status: 201 });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error creating shop:', error);
    return NextResponse.json({ error: 'Failed to create shop' }, { status: 500 });
  }
}

// PATCH /api/shops - Update shop (soft delete)
export async function PATCH(request: NextRequest) {
  let client;
  try {
    const { id, name, ownerName, area, address, phone, routeDay, orderbookerId, status, creditLimit } = await request.json();

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // Fetch existing
    const existingRes = await client.query('SELECT * FROM "Shop" WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }
    const existing = existingRes.rows[0];

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name) { setClauses.push(`name = $${paramIndex++}`); params.push(name); }
    if (ownerName !== undefined) { setClauses.push(`"ownerName" = $${paramIndex++}`); params.push(ownerName); }
    if (area !== undefined) { setClauses.push(`area = $${paramIndex++}`); params.push(area); }
    if (address !== undefined) { setClauses.push(`address = $${paramIndex++}`); params.push(address); }
    if (phone !== undefined) { setClauses.push(`phone = $${paramIndex++}`); params.push(phone); }
    if (routeDay) { setClauses.push(`"routeDay" = $${paramIndex++}`); params.push(routeDay); }
    if (orderbookerId) { setClauses.push(`"orderbookerId" = $${paramIndex++}`); params.push(orderbookerId); }
    if (status) { setClauses.push(`status = $${paramIndex++}`); params.push(status); }
    if (creditLimit !== undefined) { setClauses.push(`"creditLimit" = $${paramIndex++}`); params.push(creditLimit > 0 ? creditLimit : 0); }

    if (setClauses.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    params.push(id);
    const updatedRes = await client.query(
      `UPDATE "Shop" SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
    const updated = updatedRes.rows[0];

    // Audit log (best-effort)
    try {
      await client.query(
        `INSERT INTO "AuditLog" (action, "entityType", "entityId", "oldValue", "newValue", description)
         VALUES ('edit', 'shop', $1, $2, $3, $4)`,
        [id, JSON.stringify({ name: existing.name, area: existing.area, status: existing.status }), JSON.stringify({ name, area, status }), `Updated shop: ${existing.name}`]
      );
    } catch { /* non-blocking */ }

    await client.end();
    return NextResponse.json(updated);
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error updating shop:', error);
    return NextResponse.json({ error: 'Failed to update shop' }, { status: 500 });
  }
}
