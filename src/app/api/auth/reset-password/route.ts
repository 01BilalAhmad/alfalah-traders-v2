import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/auth-guard';

// POST /api/auth/reset-password — Reset any user's password (Admin only)
export async function POST(request: NextRequest) {
  // Verify admin access
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const { username, newPassword } = await request.json();

    if (!username || !newPassword) {
      return NextResponse.json({ error: 'Username and new password required' }, { status: 400 });
    }

    const pool = getPool();

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    const result = await pool.query(
      'UPDATE "User" SET password = $1 WHERE LOWER(username) = LOWER($2) RETURNING id, username, name, role',
      [hashedPassword, username.trim()]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: { id: result.rows[0].id, username: result.rows[0].username, name: result.rows[0].name },
      message: `Password reset for ${username}`
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
