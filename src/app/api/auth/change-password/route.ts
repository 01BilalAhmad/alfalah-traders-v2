import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// POST /api/auth/change-password — Change user password
export async function POST(request: Request) {
  try {
    const { userId, currentPassword, newPassword } = await request.json();

    if (!userId || !currentPassword || !newPassword) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    if (newPassword.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
    }

    const pool = getPool();

    // Fetch user
    const userRes = await pool.query('SELECT id, password FROM "User" WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userRes.rows[0];

    // Verify current password
    const bcrypt = await import('bcryptjs');
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE "User" SET password = $1, "updatedAt" = NOW() WHERE id = $2', [hashedPassword, userId]);

    return NextResponse.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
