import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import crypto from 'crypto';

// GET /api/users/:id/daily-target?month=YYYY-MM
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // YYYY-MM format

    const pool = getPool();

    const conditions: string[] = [`"orderbookerId" = $1`];
    const queryParams: any[] = [userId];
    let paramIndex = 2;

    if (month) {
      conditions.push(`month = $${paramIndex++}`);
      queryParams.push(month);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const targetRes = await pool.query(
      `SELECT * FROM "DailyTarget" ${whereClause} ORDER BY month DESC`,
      queryParams
    );

    const targets = targetRes.rows.map((t: any) => ({
      id: t.id,
      orderbookerId: t.orderbookerId,
      target: Number(t.target),
      month: t.month,
      createdBy: t.createdBy,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
      updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
    }));

    // If specific month requested, return single target or null
    if (month) {
      return NextResponse.json(targets[0] || null);
    }
    return NextResponse.json(targets);
  } catch (error) {
    console.error('Error fetching daily target:', error);
    return NextResponse.json({ error: 'Failed to fetch target' }, { status: 500 });
  }
}

// POST /api/users/:id/daily-target - Set daily target for an orderbooker
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderbookerId } = await params;
    // SECURITY: Use authenticated user ID from proxy header
    const createdBy = request.headers.get('x-auth-userid');
    const { target, month } = await request.json();

    if (!target || !month || !createdBy) {
      return NextResponse.json({ error: 'target, month, and authentication are required' }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month must be in YYYY-MM format' }, { status: 400 });
    }

    if (target <= 0) {
      return NextResponse.json({ error: 'Target must be greater than 0' }, { status: 400 });
    }

    const pool = getPool();

    // Upsert: if target exists for this orderbooker+month, update it
    const existingRes = await pool.query(
      'SELECT id FROM "DailyTarget" WHERE "orderbookerId" = $1 AND month = $2',
      [orderbookerId, month]
    );

    let result;
    if (existingRes.rows.length > 0) {
      // Update
      const updateRes = await pool.query(
        `UPDATE "DailyTarget" SET target = $1, "createdBy" = $2, "updatedAt" = NOW()
         WHERE "orderbookerId" = $3 AND month = $4
         RETURNING *`,
        [target, createdBy, orderbookerId, month]
      );
      result = updateRes.rows[0];
    } else {
      // Insert
      const targetId = `target_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
      const insertRes = await pool.query(
        `INSERT INTO "DailyTarget" (id, "orderbookerId", target, month, "createdBy", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [targetId, orderbookerId, target, month, createdBy]
      );
      result = insertRes.rows[0];
    }

    return NextResponse.json({
      id: result.id,
      orderbookerId: result.orderbookerId,
      target: Number(result.target),
      month: result.month,
      createdBy: result.createdBy,
      createdAt: result.createdAt instanceof Date ? result.createdAt.toISOString() : result.createdAt,
      updatedAt: result.updatedAt instanceof Date ? result.updatedAt.toISOString() : result.updatedAt,
    });
  } catch (error) {
    console.error('Error saving daily target:', error);
    return NextResponse.json({ error: 'Failed to save target' }, { status: 500 });
  }
}

// DELETE /api/users/:id/daily-target?month=YYYY-MM
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderbookerId } = await params;
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    if (!month) {
      return NextResponse.json({ error: 'month query param is required' }, { status: 400 });
    }

    const pool = getPool();

    const deleteRes = await pool.query(
      'DELETE FROM "DailyTarget" WHERE "orderbookerId" = $1 AND month = $2 RETURNING id',
      [orderbookerId, month]
    );

    if (deleteRes.rows.length === 0) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting daily target:', error);
    return NextResponse.json({ error: 'Failed to delete target' }, { status: 500 });
  }
}
