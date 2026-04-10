import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// POST /api/auth/change-password
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, username, currentPassword, newPassword } = body;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    if (!userId && !username) {
      return NextResponse.json(
        { error: 'User ID or username is required' },
        { status: 400 }
      );
    }

    // Validate new password length
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'New password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Validate new password length upper bound
    if (newPassword.length > 128) {
      return NextResponse.json(
        { error: 'New password must be less than 128 characters' },
        { status: 400 }
      );
    }

    // Find user by userId or username
    const user = await db.user.findUnique({
      where: userId ? { id: userId } : { username: username!.trim().toLowerCase() },
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

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Check that new password is different from current
    const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (isSameAsCurrent) {
      return NextResponse.json(
        { error: 'New password must be different from the current password' },
        { status: 400 }
      );
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update the user's password
    await db.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword },
    });

    // Create audit log entry
    await db.auditLog.create({
      data: {
        action: 'password_change',
        entityType: 'user',
        entityId: user.id,
        performedBy: user.id,
        description: `User "${user.name}" (@${user.username}) changed their password`,
      },
    });

    return NextResponse.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
