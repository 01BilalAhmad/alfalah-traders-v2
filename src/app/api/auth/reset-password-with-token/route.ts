import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import bcrypt from 'bcryptjs';

// POST /api/auth/reset-password-with-token — Reset password using email token (PUBLIC)
export async function POST(request: Request) {
  try {
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: 'Token and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Find valid token
    const tokenResult = await pool.query(
      'SELECT id, "userId", "expiresAt", used FROM "PasswordResetToken" WHERE token = $1',
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid reset token. Please request a new password reset.' },
        { status: 400 }
      );
    }

    const resetToken = tokenResult.rows[0];

    // Check if token already used
    if (resetToken.used) {
      return NextResponse.json(
        { error: 'This reset link has already been used. Please request a new one.' },
        { status: 400 }
      );
    }

    // Check if token expired
    if (new Date(resetToken.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'This reset link has expired. Please request a new password reset.' },
        { status: 400 }
      );
    }

    // Verify user exists and is admin
    const userResult = await pool.query(
      'SELECT id, username, name, role FROM "User" WHERE id = $1',
      [resetToken.userId]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userResult.rows[0];

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'This reset link is not valid for this account type.' },
        { status: 403 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE "User" SET password = $1, "updatedAt" = NOW() WHERE id = $2',
      [hashedPassword, user.id]
    );

    // Mark token as used
    await pool.query(
      'UPDATE "PasswordResetToken" SET used = true WHERE id = $1',
      [resetToken.id]
    );

    // Also invalidate all other tokens for this user
    await pool.query(
      'UPDATE "PasswordResetToken" SET used = true WHERE "userId" = $1',
      [user.id]
    );

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully. You can now sign in with your new password.',
    });
  } catch (error) {
    console.error('Reset password with token error:', error);
    return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 });
  }
}
