import { NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// POST /api/auth/login — Raw pg login (no Prisma)
export async function POST(request: Request) {
  let client;
  try {
    client = getPgClient();
    await client.connect();

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const res = await client.query(
      'SELECT id, username, name, role, phone, status, password, "createdAt" FROM "User" WHERE LOWER(username) = $1',
      [normalizedUsername]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = res.rows[0];

    if (user.status === 'inactive') {
      return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 });
    }

    // Verify password with bcrypt
    const bcrypt = await import('bcryptjs');
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await client.end();

    const { password: _, ...safeUser } = user;
    return NextResponse.json({ user: safeUser, token: `session-${user.id}-${Date.now()}` });
  } catch (error: unknown) {
    if (client) await client.end().catch(() => {});
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Login error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
