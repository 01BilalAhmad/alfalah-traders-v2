import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import crypto from 'crypto';

// PATCH /api/shops/bulk-status
export async function PATCH(request: NextRequest) {
  try {
    const { shopIds, status } = await request.json();

    if (!shopIds || !Array.isArray(shopIds) || shopIds.length === 0) {
      return NextResponse.json({ error: 'shopIds array is required' }, { status: 400 });
    }

    if (!status || !['active', 'inactive'].includes(status)) {
      return NextResponse.json({ error: 'status must be "active" or "inactive"' }, { status: 400 });
    }

    const pool = getPool();

    // Update all shops
    const placeholders = shopIds.map((_: unknown, idx: number) => `$${idx + 1}`).join(', ');
    const updateRes = await pool.query(
      `UPDATE "Shop" SET status = $${shopIds.length + 1} WHERE id IN (${placeholders})`,
      [...shopIds, status]
    );

    const resultCount = updateRes.rowCount || 0;

    // Create audit log entry (best-effort)
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "newValue", description)
         VALUES ($1, 'edit', 'shop', 'bulk', $2, $3)`,
        [
          auditId,
          JSON.stringify({ action: 'bulk-status', shopIds, status, count: resultCount }),
          `Bulk ${status === 'active' ? 'reactivated' : 'deactivated'} ${resultCount} shops`,
        ]
      );
    } catch (auditError) {
      console.error('Audit log creation failed (non-blocking):', auditError);
    }

    return NextResponse.json({ success: true, updated: resultCount });
  } catch (error) {
    console.error('Error bulk updating shop status:', error);
    return NextResponse.json({ error: 'Failed to bulk update shop status' }, { status: 500 });
  }
}
