import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// PATCH /api/areas/[id] — update area name
// DELETE /api/areas/[id] — delete area (shops become "Unassigned")

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name, description } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Area name is required' }, { status: 400 });
    }

    const pool = getPool();

    // Check for duplicates (excluding current)
    const existing = await pool.query(
      `SELECT id FROM "Area" WHERE LOWER(name) = LOWER($1) AND id != $2`,
      [name.trim(), id]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Area already exists' }, { status: 409 });
    }

    // Get old name for updating shops
    const oldRes = await pool.query('SELECT name FROM "Area" WHERE id = $1', [id]);
    if (oldRes.rows.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }
    const oldName = oldRes.rows[0].name;

    // Update area
    const now = new Date().toISOString();
    const res = await pool.query(
      `UPDATE "Area" SET name = $1, description = $2, "updatedAt" = $3 WHERE id = $4 RETURNING *`,
      [name.trim(), description || null, now, id]
    );

    // Update all shops that had old area name
    await pool.query(
      `UPDATE "Shop" SET area = $1 WHERE area = $2`,
      [name.trim(), oldName]
    );

    return NextResponse.json(res.rows[0]);
  } catch (error) {
    console.error('[Areas API] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update area' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pool = getPool();

    // Get area name
    const areaRes = await pool.query('SELECT name FROM "Area" WHERE id = $1', [id]);
    if (areaRes.rows.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }
    const areaName = areaRes.rows[0].name;

    // Set shops with this area to NULL (Unassigned)
    await pool.query(
      `UPDATE "Shop" SET area = NULL WHERE area = $1`,
      [areaName]
    );

    // Delete area
    await pool.query('DELETE FROM "Area" WHERE id = $1', [id]);

    return NextResponse.json({ success: true, message: 'Area deleted' });
  } catch (error) {
    console.error('[Areas API] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete area' }, { status: 500 });
  }
}
