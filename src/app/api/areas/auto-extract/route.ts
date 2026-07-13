import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// POST /api/areas/auto-extract
// Extracts all unique areas from existing shops and creates Area records
// Merges duplicates (case-insensitive)

export async function POST() {
  try {
    const pool = getPool();

    // Ensure table exists
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
    `);

    // Get all unique areas from shops (case-insensitive dedup)
    const res = await pool.query(`
      SELECT DISTINCT LOWER(area) AS lower_area, 
             MIN(area) AS original_name,
             COUNT(*) AS shop_count
      FROM "Shop" 
      WHERE area IS NOT NULL AND area != ''
      GROUP BY LOWER(area)
      ORDER BY original_name ASC
    `);

    let created = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const row of res.rows) {
      const areaName = row.original_name;
      
      // Check if area already exists
      const existing = await pool.query(
        `SELECT id FROM "Area" WHERE LOWER(name) = LOWER($1)`,
        [areaName]
      );

      if (existing.rows.length === 0) {
        // Create new area
        const id = `area_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
        await pool.query(
          `INSERT INTO "Area" (id, name, description, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $4)`,
          [id, areaName, `Auto-extracted (${row.shop_count} shops)`, now]
        );
        created++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      created,
      skipped,
      totalFound: res.rows.length,
      message: `${created} areas created, ${skipped} already existed`,
    });
  } catch (error) {
    console.error('[Areas API] Auto-extract error:', error);
    return NextResponse.json({ error: 'Failed to extract areas' }, { status: 500 });
  }
}
