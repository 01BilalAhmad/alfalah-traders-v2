import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// POST /api/auth/login — Uses Prisma (works with SQLite & PostgreSQL)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    console.log('Login attempt for:', username);

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const user = await db.user.findUnique({
      where: { username: normalizedUsername },
    });

    console.log('User found:', user ? user.name : 'NO');

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (user.status === 'inactive') {
      return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const { password: _, ...safeUser } = user;
    return NextResponse.json({ user: safeUser, token: `session-${user.id}-${Date.now()}` });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Login FULL error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal server error', detail: err.message }, { status: 500 });
  }
}
