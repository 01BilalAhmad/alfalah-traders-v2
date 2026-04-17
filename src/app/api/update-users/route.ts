import { NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// GET /api/update-users — Update user names (browser-friendly)
export async function GET() {
  return POST();
}

// POST /api/update-users — Update user names and usernames
export async function POST() {
  let client;
  try {
    client = getPgClient();
    await client.connect();

    // Update ahmed → ob03 / M.Ali
    await client.query(
      'UPDATE "User" SET username = $1, name = $2 WHERE username = $3',
      ['ob03', 'M.Ali', 'ahmed']
    );

    // Update bilal → ob04 / Ghulam Murtaza
    await client.query(
      'UPDATE "User" SET username = $1, name = $2 WHERE username = $3',
      ['ob04', 'Ghulam Murtaza', 'bilal']
    );

    // Show updated users
    const res = await client.query('SELECT username, name, role FROM "User" ORDER BY role, name');
    await client.end();

    return NextResponse.json({
      success: true,
      message: 'Users updated',
      users: res.rows,
    });
  } catch (error: unknown) {
    if (client) await client.end().catch(() => {});
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
