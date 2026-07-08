import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';

// POST /api/auth/change-password — Change user password
// SECURITY: Users can only change their own password; admins can change any
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Verify authenticated user
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { userId, currentPassword, newPassword } = await request.json();

    if (!userId || !currentPassword || !newPassword) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // SECURITY: Users can only change their own password (admins can change any)
    if (auth.user?.role !== 'admin' && auth.userId !== userId) {
      return NextResponse.json({ error: 'You can only change your own password' }, { status: 403 });
    }

    // SECURITY: Enforce minimum password length of 8 characters
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // SECURITY: Enforce maximum password length to prevent bcrypt DoS
    if (newPassword.length > 128) {
      return NextResponse.json({ error: 'Password must be 128 characters or less' }, { status: 400 });
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
