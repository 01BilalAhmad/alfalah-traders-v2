import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { ensureShopColumns } from '@/lib/tally-migrations';

// PATCH /api/shops/[id]/tally-frequency
// Body: { tallyFrequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'none' }
// Admin-only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: shopId } = await params;
    const body = await request.json();
    const { tallyFrequency } = body;

    const valid = ['daily', 'weekly', 'monthly', 'quarterly', 'none'];
    if (!valid.includes(tallyFrequency)) {
      return NextResponse.json({ error: `Invalid tallyFrequency. Valid: ${valid.join(', ')}` }, { status: 400 });
    }

    const pool = getPool();
    await ensureShopColumns();

    const shopRes = await pool.query('SELECT id, name FROM "Shop" WHERE id = $1', [shopId]);
    if (shopRes.rows.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    await pool.query(
      `UPDATE "Shop" SET "tallyFrequency" = $1, "updatedAt" = NOW() WHERE id = $2`,
      [tallyFrequency, shopId]
    );

    return NextResponse.json({
      success: true,
      shopId,
      tallyFrequency,
    });
  } catch (error) {
    console.error('[Shop Tally Frequency API] error:', error);
    return NextResponse.json({ error: 'Failed to update tally frequency' }, { status: 500 });
  }
}
