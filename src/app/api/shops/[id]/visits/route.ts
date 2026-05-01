import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';
import crypto from 'crypto';

// POST /api/shops/:id/visits - Record a GPS-verified shop visit
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let client;
  try {
    const { id: shopId } = await params;
    const { orderbookerId, gpsLat, gpsLng, gpsAddress, inRange } = await request.json();

    if (!shopId || !orderbookerId) {
      return NextResponse.json({ error: 'shopId and orderbookerId are required' }, { status: 400 });
    }

    client = getPgClient();
    await client.connect();

    // Verify shop exists
    const shopRes = await client.query('SELECT id, name FROM "Shop" WHERE id = $1', [shopId]);
    if (shopRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const visitId = `visit_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
    const visitRes = await client.query(
      `INSERT INTO "ShopVisit" (id, "shopId", "orderbookerId", "gpsLat", "gpsLng", "gpsAddress", "inRange", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [visitId, shopId, orderbookerId, gpsLat || null, gpsLng || null, gpsAddress || null, inRange !== false]
    );

    const visit = visitRes.rows[0];

    await client.end();
    return NextResponse.json({
      id: visit.id,
      shopId: visit.shopId,
      orderbookerId: visit.orderbookerId,
      gpsLat: visit.gpsLat,
      gpsLng: visit.gpsLng,
      gpsAddress: visit.gpsAddress,
      inRange: visit.inRange,
      createdAt: visit.createdAt instanceof Date ? visit.createdAt.toISOString() : visit.createdAt,
    }, { status: 201 });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error recording shop visit:', error);
    return NextResponse.json({ error: 'Failed to record visit' }, { status: 500 });
  }
}

// GET /api/shops/:id/visits - Get visits for a shop
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let client;
  try {
    const { id: shopId } = await params;
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // YYYY-MM-DD
    const orderbookerId = searchParams.get('orderbookerId');
    const limit = parseInt(searchParams.get('limit') || '50');

    client = getPgClient();
    await client.connect();

    const conditions: string[] = [`v."shopId" = $1`];
    const params: any[] = [shopId];
    let paramIndex = 2;

    if (orderbookerId) {
      conditions.push(`v."orderbookerId" = $${paramIndex++}`);
      params.push(orderbookerId);
    }

    if (date) {
      // Filter by Pakistan timezone day
      const [year, month, day] = date.split('-').map(Number);
      const start = new Date(Date.UTC(year, month - 1, day, -5, 0, 0, 0));
      const end = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));
      conditions.push(`v."createdAt" >= $${paramIndex++}`);
      params.push(start.toISOString());
      conditions.push(`v."createdAt" <= $${paramIndex++}`);
      params.push(end.toISOString());
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const visitsRes = await client.query(
      `SELECT v.*, u.name AS "orderbookerName"
       FROM "ShopVisit" v
       LEFT JOIN "User" u ON v."orderbookerId" = u.id
       ${whereClause}
       ORDER BY v."createdAt" DESC
       LIMIT $${paramIndex++}`,
      [...params, limit]
    );

    const visits = visitsRes.rows.map((v: any) => ({
      id: v.id,
      shopId: v.shopId,
      orderbookerId: v.orderbookerId,
      orderbookerName: v.orderbookerName,
      gpsLat: v.gpsLat,
      gpsLng: v.gpsLng,
      gpsAddress: v.gpsAddress,
      inRange: v.inRange,
      createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
    }));

    await client.end();
    return NextResponse.json(visits);
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error fetching shop visits:', error);
    return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 });
  }
}
