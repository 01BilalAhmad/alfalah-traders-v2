import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// POST /api/auth/change-password
export async function POST(request: NextRequest) {
  try {
    const { userId, currentPassword, newPassword } = await request.json();

    if (!userId || !currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'User ID, current password, and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'New password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        phone: true,
        status: true,
        password: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.status === 'inactive') {
      return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    await db.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword },
    });

    return NextResponse.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
