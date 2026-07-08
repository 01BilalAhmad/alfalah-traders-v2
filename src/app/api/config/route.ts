import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/config — public endpoint for business config (no auth required)
// Used by login page and other public pages to display business name and phone
// v2: added businessPhone support
export async function GET() {
  try {
    const pool = getPool();

    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "SystemConfig" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "key" TEXT NOT NULL UNIQUE,
        "value" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default businessName if not exists
    const existingName = await pool.query(`SELECT * FROM "SystemConfig" WHERE "key" = 'businessName'`);
    if (existingName.rows.length === 0) {
      await pool.query(
        `INSERT INTO "SystemConfig" ("id", "key", "value", "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())`,
        [`config-business-name`, 'businessName', 'AL-FALAH TRADERS']
      );
    }

    // Seed default businessPhone if not exists
    const existingPhone = await pool.query(`SELECT * FROM "SystemConfig" WHERE "key" = 'businessPhone'`);
    if (existingPhone.rows.length === 0) {
      await pool.query(
        `INSERT INTO "SystemConfig" ("id", "key", "value", "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())`,
        [`config-business-phone`, 'businessPhone', '']
      );
    }

    const result = await pool.query(`SELECT * FROM "SystemConfig"`);
    const config: Record<string, string> = {};
    result.rows.forEach((row: { key: string; value: string }) => {
      config[row.key] = row.value;
    });

    return NextResponse.json({ config });
  } catch {
    // If DB not available, return default
    return NextResponse.json({ config: { businessName: 'AL-FALAH TRADERS', businessPhone: '' } });
  }
}
