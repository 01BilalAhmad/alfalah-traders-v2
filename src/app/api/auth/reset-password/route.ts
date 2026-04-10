import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// POST /api/auth/reset-password
export async function POST(request: NextRequest) {
  try {
    const { username, newPassword, confirmPassword } = await request.json();

    if (!username || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: 'Username, new password, and confirm password are required' },
        { status: 400 }
      );
    }

    // Normalize username
    const normalizedUsername = username.trim().toLowerCase();

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match' },
        { status: 400 }
      );
    }

    // Validate password strength (minimum 6 characters)
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Find user
    const user = await db.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true, username: true, name: true, role: true, status: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'No account found with this username' },
        { status: 404 }
      );
    }

    if (user.status === 'inactive') {
      return NextResponse.json(
        { error: 'This account is deactivated. Contact admin.' },
        { status: 403 }
      );
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully',
      user: { name: user.name, username: user.username, role: user.role },
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
