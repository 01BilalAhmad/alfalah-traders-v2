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

    if (obRes.rows.length === 0) {
      return NextResponse.json({ success: true, total: 0, created: 0, skipped: 0 });
    }

    // Find existing UserCompany entries in ONE query (avoids N+1 SELECT loop)
    const userIds = obRes.rows.map((r: any) => r.id);
    const existingRes = await pool.query(
      `SELECT "userId", "companyId" FROM "UserCompany"
       WHERE "userId" = ANY($1::text[])`,
      [userIds]
    );
    const existingSet = new Set(
      existingRes.rows.map((r: any) => `${r.userId}|${r.companyId}`)
    );

    // Build batch INSERT for all missing pairs (avoids N+1 INSERT loop)
    const now = new Date().toISOString();
    const insertValuesClauses: string[] = [];
    const insertParams: any[] = [];
    let created = 0;
    let skipped = 0;

    for (const ob of obRes.rows) {
      const key = `${ob.id}|${ob.companyId}`;
      if (existingSet.has(key)) {
        skipped++;
        continue;
      }
      const ucId = `uc_${ob.id}_${ob.companyId}`;
      const paramBase = insertParams.length;
      insertValuesClauses.push(
        `($${paramBase + 1}, $${paramBase + 2}, $${paramBase + 3}, true, $${paramBase + 4}, $${paramBase + 4})`
      );
      insertParams.push(ucId, ob.id, ob.companyId, now);
      created++;
    }

    if (insertValuesClauses.length > 0) {
      await pool.query(
        `INSERT INTO "UserCompany" (id, "userId", "companyId", "isPrimary", "createdAt", "updatedAt")
         VALUES ${insertValuesClauses.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        insertParams
      );
    }

    return NextResponse.json({
      success: true,
      total: obRes.rows.length,
      created,
      skipped,
    });
  } catch (error: any) {
    console.error('Backfill error:', error);
    return NextResponse.json({ error: error.message || 'Backfill failed' }, { status: 500 });
  }
}
