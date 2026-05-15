import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// POST /api/admin/backfill-user-companies
// One-time migration: populate UserCompany table from existing User.companyId
export async function POST(request: NextRequest) {
  let client;
  try {
    client = getPgClient();
    await client.connect();

    // Get all orderbookers with a companyId
    const obRes = await client.query(
      `SELECT id, "companyId" FROM "User" WHERE role = 'orderbooker' AND "companyId" IS NOT NULL`
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const ob of obRes.rows) {
      try {
        // Check if UserCompany record already exists
        const existing = await client.query(
          `SELECT id FROM "UserCompany" WHERE "userId" = $1 AND "companyId" = $2`,
          [ob.id, ob.companyId]
        );

        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        // Create UserCompany record
        const now = new Date().toISOString();
        await client.query(
          `INSERT INTO "UserCompany" (id, "userId", "companyId", "isPrimary", "createdAt", "updatedAt")
           VALUES (CONCAT('uc_', $1, '_', $2), $1, $2, true, $3, $3)`,
          [ob.id, ob.companyId, now]
        );
        created++;
      } catch (e: any) {
        errors.push(`${ob.id}: ${e.message}`);
      }
    }

    await client.end();
    return NextResponse.json({
      success: true,
      total: obRes.rows.length,
      created,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    if (client) await client.end().catch(() => {});
    console.error('Backfill error:', error);
    return NextResponse.json({ error: error.message || 'Backfill failed' }, { status: 500 });
  }
}
