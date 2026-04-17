import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// POST /api/auth/login — Uses Prisma (works with SQLite & PostgreSQL)
export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const user = await db.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (user.status === 'inactive') {
      return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 });
    }

    // Verify password with bcrypt
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const { password: _, ...safeUser } = user;
    return NextResponse.json({ user: safeUser, token: `session-${user.id}-${Date.now()}` });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Login error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
