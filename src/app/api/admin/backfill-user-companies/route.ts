import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// POST /api/admin/backfill-user-companies
// One-time migration: populate UserCompany table from existing User.companyId
export async function POST(request: NextRequest) {
  try {
    const pool = getPool();

    // Get all orderbookers with a companyId
    const obRes = await pool.query(
      `SELECT id, "companyId" FROM "User" WHERE role = 'orderbooker' AND "companyId" IS NOT NULL`
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const ob of obRes.rows) {
      try {
        // Check if UserCompany record already exists
        const existing = await pool.query(
          `SELECT id FROM "UserCompany" WHERE "userId" = $1 AND "companyId" = $2`,
          [ob.id, ob.companyId]
        );

        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        // Create UserCompany record
        const now = new Date().toISOString();
        const ucId = `uc_${ob.id}_${ob.companyId}`;
        await pool.query(
          `INSERT INTO "UserCompany" (id, "userId", "companyId", "isPrimary", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, true, $4, $4)`,
          [ucId, ob.id, ob.companyId, now]
        );
        created++;
      } catch (e: any) {
        errors.push(`${ob.id}: ${e.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      total: obRes.rows.length,
      created,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Backfill error:', error);
    return NextResponse.json({ error: error.message || 'Backfill failed' }, { status: 500 });
  }
}
