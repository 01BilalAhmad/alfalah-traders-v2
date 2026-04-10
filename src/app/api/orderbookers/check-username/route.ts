import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/orderbookers/check-username?username=xxx&excludeId=yyy
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const excludeId = searchParams.get('excludeId');

    if (!username) {
      return NextResponse.json({ error: 'Username parameter is required' }, { status: 400 });
    }

    const trimmedUsername = username.trim().toLowerCase();

    if (trimmedUsername.length < 2) {
      return NextResponse.json({ available: false, message: 'Username must be at least 2 characters' });
    }

    const existingUser = await db.user.findFirst({
      where: {
        username: trimmedUsername,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true, username: true, name: true, status: true },
    });

    if (existingUser) {
      return NextResponse.json({
        available: false,
        message: `Username "@${existingUser.username}" is already taken by ${existingUser.name}${existingUser.status === 'inactive' ? ' (inactive)' : ''}`,
        existingUser: {
          name: existingUser.name,
          username: existingUser.username,
          status: existingUser.status,
        },
      });
    }

    return NextResponse.json({ available: true, message: 'Username is available' });
  } catch (error) {
    console.error('Error checking username:', error);
    return NextResponse.json({ error: 'Failed to check username' }, { status: 500 });
  }
}
