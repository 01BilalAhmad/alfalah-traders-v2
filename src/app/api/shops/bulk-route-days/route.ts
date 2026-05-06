import { NextRequest, NextResponse } from 'next/server';
import { getPgClient, toPgArray } from '@/lib/pg';
import crypto from 'crypto';

const VALID_ROUTE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'saturday', 'sunday'];

// PATCH /api/shops/bulk-route-days
// Assign route days to shops in bulk
// Body: { shopIds?: string[], routeDays: string[], areaFilter?: string, assignAll?: boolean }
export async function PATCH(request: NextRequest) {
  let client;
  try {
    const { shopIds, routeDays, areaFilter, assignAll, performedBy } = await request.json();

    if (!routeDays || !Array.isArray(routeDays) || routeDays.length === 0) {
      return NextResponse.json({ error: 'routeDays array is required (e.g., ["monday", "thursday"])' }, { status: 400 });
    }

    // Validate route days
    const normalizedDays = routeDays.map((d: string) => d.toLowerCase()).filter((d: string) => VALID_ROUTE_DAYS.includes(d));
    if (normalizedDays.length === 0) {
      return NextResponse.json({ error: `Invalid route days. Valid: ${VALID_ROUTE_DAYS.join(', ')}` }, { status: 400 });
    }

    client = getPgClient();
    await client.connect();

    let updateRes;

    if (assignAll) {
      // Assign routeDays to ALL shops that currently have empty routeDays
      if (areaFilter) {
        updateRes = await client.query(
          `UPDATE "Shop" SET "routeDays" = $1::text[], "updatedAt" = $2 WHERE ("routeDays" = '{}' OR "routeDays" = ARRAY[]::text[] OR "routeDays" IS NULL) AND area ILIKE $3`,
          [toPgArray(normalizedDays), new Date().toISOString(), `%${areaFilter}%`]
        );
      } else {
        updateRes = await client.query(
          `UPDATE "Shop" SET "routeDays" = $1::text[], "updatedAt" = $2 WHERE "routeDays" = '{}' OR "routeDays" = ARRAY[]::text[] OR "routeDays" IS NULL`,
          [toPgArray(normalizedDays), new Date().toISOString()]
        );
      }
    } else if (shopIds && Array.isArray(shopIds) && shopIds.length > 0) {
      // Assign routeDays to specific shops
      const placeholders = shopIds.map((_: unknown, idx: number) => `$${idx + 3}`).join(', ');
      updateRes = await client.query(
        `UPDATE "Shop" SET "routeDays" = $1::text[], "updatedAt" = $2 WHERE id IN (${placeholders})`,
        [toPgArray(normalizedDays), new Date().toISOString(), ...shopIds]
      );
    } else if (areaFilter) {
      // Assign routeDays to all shops matching area
      updateRes = await client.query(
        `UPDATE "Shop" SET "routeDays" = $1::text[], "updatedAt" = $2 WHERE area ILIKE $3`,
        [toPgArray(normalizedDays), new Date().toISOString(), `%${areaFilter}%`]
      );
    } else {
      await client.end();
      return NextResponse.json({ error: 'Provide shopIds, areaFilter, or assignAll=true' }, { status: 400 });
    }

    const resultCount = updateRes?.rowCount || 0;

    // Audit log
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await client.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "performedBy", "newValue", description)
         VALUES ($1, 'edit', 'shop', 'bulk-route-days', $2, $3, $4)`,
        [
          auditId,
          performedBy || null,
          JSON.stringify({ action: 'bulk-route-days-assign', routeDays: normalizedDays, areaFilter, assignAll, count: resultCount }),
          `Bulk assigned routeDays [${normalizedDays.join(', ')}] to ${resultCount} shops${areaFilter ? ` in area "${areaFilter}"` : ''}`,
        ]
      );
    } catch { /* non-blocking */ }

    await client.end();
    return NextResponse.json({
      success: true,
      updated: resultCount,
      routeDays: normalizedDays,
      areaFilter: areaFilter || null,
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error bulk assigning route days:', error);
    return NextResponse.json({ error: 'Failed to bulk assign route days' }, { status: 500 });
  }
}
