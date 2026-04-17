import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';

const { Client } = pg;

// PATCH /api/shops/bulk-assign
export async function PATCH(request: NextRequest) {
  let client;
  try {
    const { shopIds, orderbookerId } = await request.json();

    if (!shopIds || !Array.isArray(shopIds) || shopIds.length === 0) {
      return NextResponse.json({ error: 'shopIds array is required' }, { status: 400 });
    }

    if (!orderbookerId) {
      return NextResponse.json({ error: 'orderbookerId is required' }, { status: 400 });
    }

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // Verify the orderbooker exists
    const obRes = await client.query(
      `SELECT id, name, status FROM "User" WHERE id = $1`,
      [orderbookerId]
    );

    if (obRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'Orderbooker not found. Please select a valid orderbooker.' }, { status: 404 });
    }

    const orderbooker = obRes.rows[0];
    if (orderbooker.status !== 'active') {
      await client.end();
      return NextResponse.json({ error: `"${orderbooker.name}" is currently inactive. Please activate them first or choose a different orderbooker.` }, { status: 400 });
    }

    // Update all shops
    const placeholders = shopIds.map((_: unknown, idx: number) => `$${idx + 1}`).join(', ');
    const updateRes = await client.query(
      `UPDATE "Shop" SET "orderbookerId" = $${shopIds.length + 1} WHERE id IN (${placeholders})`,
      [...shopIds, orderbookerId]
    );

    const resultCount = updateRes.rowCount || 0;

    // Create audit log entry (best-effort)
    try {
      await client.query(
        `INSERT INTO "AuditLog" (action, "entityType", "entityId", "performedBy", "newValue", description)
         VALUES ('edit', 'shop', 'bulk', $1, $2)`,
        [
          JSON.stringify({ action: 'bulk-assign', shopIds, orderbookerId, count: resultCount }),
          `Bulk assigned ${resultCount} shops to orderbooker ${orderbooker.name}`,
        ]
      );
    } catch (auditError) {
      console.error('Audit log creation failed (non-blocking):', auditError);
    }

    await client.end();
    return NextResponse.json({ success: true, updated: resultCount });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error bulk assigning shops:', error);
    return NextResponse.json({ error: 'Failed to bulk assign shops' }, { status: 500 });
  }
}
