import { NextResponse } from 'next/server';
import pg from 'pg';

const { Client } = pg;

export async function GET() {
  let client;
  try {
    client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();

    // Check current users
    const check = await client.query('SELECT username, name FROM "User" ORDER BY name');
    
    // Update ahmed → ob03 / M.Ali
    const r1 = await client.query('UPDATE "User" SET username = $1, name = $2 WHERE LOWER(username) = $3', ['ob03', 'M.Ali', 'ahmed']);
    
    // Update bilal → ob04 / Ghulam Murtaza  
    const r2 = await client.query('UPDATE "User" SET username = $1, name = $2 WHERE LOWER(username) = $3', ['ob04', 'Ghulam Murtaza', 'bilal']);

    // Verify
    const after = await client.query('SELECT username, name, role FROM "User" ORDER BY role, username');
    await client.end();

    return NextResponse.json({
      before: check.rows,
      updated: { ahmed_to_ob03: r1.rowCount, bilal_to_ob04: r2.rowCount },
      after: after.rows,
    });
  } catch (error: unknown) {
    if (client) await client.end().catch(() => {});
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
