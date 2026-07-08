import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';

// PATCH /api/users/[id] — Update user fields (e.g., email)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await requireAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  // User can only update their own email (unless admin)
  if (auth.userId !== id && auth.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { email, username, name } = body;

    const pool = getPool();

    // Ensure User table has email column
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'email') THEN
          ALTER TABLE "User" ADD COLUMN "email" TEXT;
        END IF;
      END $$;
    `);

    // Build update query dynamically for allowed fields
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (email !== undefined) {
      updates.push(`email = $${paramIdx}`);
      values.push(email || null);
      paramIdx++;
    }

    if (username !== undefined && username !== null) {
      // Check if username is already taken by another user
      const existingUser = await pool.query('SELECT id FROM "User" WHERE username = $1 AND id != $2', [username, id]);
      if (existingUser.rows.length > 0) {
        return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
      }
      if (String(username).trim().length < 3) {
        return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
      }
      updates.push(`username = $${paramIdx}`);
      values.push(String(username).trim());
      paramIdx++;
    }

    if (name !== undefined && name !== null) {
      updates.push(`name = $${paramIdx}`);
      values.push(String(name).trim());
      paramIdx++;
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push(`"updatedAt" = NOW()`);

    values.push(id);
    const query = `UPDATE "User" SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING id, username, name, email, role`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// GET /api/users/[id] — Get user details (including email)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await requireAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  // User can only view their own profile (unless admin)
  if (auth.userId !== id && auth.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, username, name, email, role, phone, status FROM "User" WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ error: 'Failed to get user' }, { status: 500 });
  }
}
