import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// POST /api/areas/bulk-assign
// Body: { areaName: string, shopIds: string[] }
// Assigns selected shops to the specified area

export async function POST(request: NextRequest) {
  try {
    const { areaName, shopIds } = await request.json();

    if (!areaName || !shopIds || !Array.isArray(shopIds) || shopIds.length === 0) {
      return NextResponse.json({ error: 'areaName and shopIds are required' }, { status: 400 });
    }

    const pool = getPool();

    // Verify area exists
    const areaRes = await pool.query('SELECT id FROM "Area" WHERE name = $1', [areaName]);
    if (areaRes.rows.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    // Bulk update shops
    // Build parameterized query for IN clause
    const placeholders = shopIds.map((_: string, i: number) => `$${i + 2}`).join(', ');
    const res = await pool.query(
      `UPDATE "Shop" SET area = $1 WHERE id IN (${placeholders}) RETURNING id`,
      [areaName, ...shopIds]
    );

    return NextResponse.json({
      success: true,
      assignedCount: res.rowCount,
      areaName,
    });
  } catch (error) {
    console.error('[Areas API] Bulk assign error:', error);
    return NextResponse.json({ error: 'Failed to assign area' }, { status: 500 });
  }
}
