import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { getPool } from '@/lib/pg';

// GET /api/admin/system-config — fetch all system config
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

    // Create index if not exists
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS "SystemConfig_key_idx" ON "SystemConfig"("key")`);
    } catch { /* ignore */ }

    // Seed default business name if not exists
    const existing = await pool.query(`SELECT * FROM "SystemConfig" WHERE "key" = 'businessName'`);
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO "SystemConfig" ("id", "key", "value", "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())`,
        [`config-business-name`, 'businessName', 'AL-FALAH TRADERS']
      );
    }

    const result = await pool.query(`SELECT * FROM "SystemConfig"`);

    // Convert to key-value object
    const config: Record<string, string> = {};
    result.rows.forEach((row: { key: string; value: string }) => {
      config[row.key] = row.value;
    });

    return NextResponse.json({ config });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('SystemConfig GET error:', msg);
    return NextResponse.json({ config: { businessName: 'AL-FALAH TRADERS' } });
  }
}

// PUT /api/admin/system-config — update system config
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 401 });
    }

    const pool = getPool();
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'Key and value are required' }, { status: 400 });
    }

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

    // Upsert the config value
    await pool.query(`
      INSERT INTO "SystemConfig" ("id", "key", "value", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT ("key") DO UPDATE SET "value" = $3, "updatedAt" = NOW()
    `, [`config-${key}`, key, value]);

    return NextResponse.json({ success: true, config: { [key]: value } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('SystemConfig PUT error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
