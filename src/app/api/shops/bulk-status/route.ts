import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';

const { Client } = pg;

// PATCH /api/shops/bulk-status
export async function PATCH(request: NextRequest) {
  let client;
  try {
    const { shopIds, status } = await request.json();

    if (!shopIds || !Array.isArray(shopIds) || shopIds.length === 0) {
      return NextResponse.json({ error: 'shopIds array is required' }, { status: 400 });
    }

    if (!status || !['active', 'inactive'].includes(status)) {
      return NextResponse.json({ error: 'status must be "active" or "inactive"' }, { status: 400 });
    }

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // Update all shops
    const placeholders = shopIds.map((_: unknown, idx: number) => `$${idx + 1}`).join(', ');
    const updateRes = await client.query(
      `UPDATE "Shop" SET status = $${shopIds.length + 1} WHERE id IN (${placeholders})`,
      [...shopIds, status]
    );

    const resultCount = updateRes.rowCount || 0;

    // Create audit log entry (best-effort)
    try {
      await client.query(
        `INSERT INTO "AuditLog" (action, "entityType", "entityId", "newValue", description)
         VALUES ('edit', 'shop', 'bulk', $1, $2)`,
        [
          JSON.stringify({ action: 'bulk-status', shopIds, status, count: resultCount }),
          `Bulk ${status === 'active' ? 'reactivated' : 'deactivated'} ${resultCount} shops`,
        ]
      );
    } catch (auditError) {
      console.error('Audit log creation failed (non-blocking):', auditError);
    }

    await client.end();
    return NextResponse.json({ success: true, updated: resultCount });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error bulk updating shop status:', error);
    return NextResponse.json({ error: 'Failed to bulk update shop status' }, { status: 500 });
  }
}
