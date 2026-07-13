import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/areas — list all areas
// POST /api/areas — create new area
// Also auto-creates table if not exists (for migration)

async function ensureTable(pool: any) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Area" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Area_name_key" ON "Area"("name");
    CREATE INDEX IF NOT EXISTS "Area_name_idx" ON "Area"("name");
  `);
}

export async function GET() {
  try {
    const pool = getPool();
    await ensureTable(pool);

    const res = await pool.query(`
      SELECT a.id, a.name, a.description, a."createdAt",
        COUNT(s.id) AS "shopCount"
      FROM "Area" a
      LEFT JOIN "Shop" s ON s.area = a.name
      GROUP BY a.id, a.name, a.description, a."createdAt"
      ORDER BY a.name ASC
    `);

    return NextResponse.json({ areas: res.rows });
  } catch (error) {
    console.error('[Areas API] GET error:', error);
    return NextResponse.json({ areas: [], error: 'Failed to fetch areas' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const pool = getPool();
    await ensureTable(pool);

    const { name, description } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Area name is required' }, { status: 400 });
    }

    // Check for duplicates (case-insensitive)
    const existing = await pool.query(
      `SELECT id FROM "Area" WHERE LOWER(name) = LOWER($1)`,
      [name.trim()]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Area already exists' }, { status: 409 });
    }

    const id = `area_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    const res = await pool.query(
      `INSERT INTO "Area" (id, name, description, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $4) RETURNING *`,
      [id, name.trim(), description || null, now]
    );

    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (error) {
    console.error('[Areas API] POST error:', error);
    return NextResponse.json({ error: 'Failed to create area' }, { status: 500 });
  }
}
