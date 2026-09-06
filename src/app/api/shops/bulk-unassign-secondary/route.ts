import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/pg';
import crypto from 'crypto';

// POST /api/shops/bulk-unassign-secondary - Bulk REMOVE secondary orderbooker assignments
// Mirrors /api/shops/bulk-assign-secondary so admins can undo secondary assignments.
// Body: { shopIds: string[], orderbookerId: string, companyId?: string }
// - If orderbookerId + companyId given: removes that specific (shop, OB, company) assignment.
// - If companyId omitted: removes ALL of that OB's secondary assignments on the given shops.
// - If orderbookerId = 'all': removes ALL secondary assignments on the given shops (optionally scoped to companyId).
export async function POST(request: NextRequest) {
  const client = await getClient();
  try {
    const { shopIds, orderbookerId, companyId } = await request.json();

    // Validate required fields
    if (!shopIds || !Array.isArray(shopIds) || shopIds.length === 0) {
      return NextResponse.json({ error: 'shopIds array is required' }, { status: 400 });
    }

    if (!orderbookerId) {
      return NextResponse.json({ error: 'orderbookerId is required (use "all" to remove every secondary assignment)' }, { status: 400 });
    }

    await client.query('BEGIN');

    const removeAll = orderbookerId === 'all';

    // Resolve orderbooker name for audit (skip for 'all')
    let orderbookerName = 'All orderbookers';
    if (!removeAll) {
      const obRes = await client.query(
        `SELECT id, name FROM "User" WHERE id = $1`,
        [orderbookerId]
      );
      if (obRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Orderbooker not found. Please select a valid orderbooker.' }, { status: 404 });
      }
      orderbookerName = obRes.rows[0].name;
    }

    // Resolve company name for audit (optional)
    let companyName = 'All companies';
    if (companyId) {
      const compRes = await client.query(
        `SELECT id, name FROM "Company" WHERE id = $1`,
        [companyId]
      );
      if (compRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Company not found. Please select a valid company.' }, { status: 404 });
      }
      companyName = compRes.rows[0].name;
    }

    let removed = 0;
    const errors: string[] = [];

    // Build ONE set-based DELETE over the selected shops (fast, atomic per shop list)
    try {
      const params: (string | string[])[] = [shopIds];
      let paramIdx = 1;

      let delQuery = `DELETE FROM "ShopOrderbooker" WHERE "shopId" = ANY($1::text[])`;
      if (!removeAll) {
        params.push(orderbookerId);
        paramIdx++;
        delQuery += ` AND "orderbookerId" = $${paramIdx}`;
      }
      if (companyId) {
        params.push(companyId);
        paramIdx++;
        delQuery += ` AND "companyId" = $${paramIdx}`;
      }
      // Note: the PRIMARY assignment lives on "Shop"."orderbookerId", not in
      // ShopOrderbooker, so this delete can never touch a primary assignment.

      delQuery += ` RETURNING id, "shopId", "orderbookerId", "companyId"`;

      const delRes = await client.query(delQuery, params);
      removed = delRes.rowCount ?? 0;
    } catch (delError) {
      const msg = delError instanceof Error ? delError.message : 'Unknown error';
      errors.push(`Delete failed: ${msg}`);
    }

    // Create audit log entry (best-effort)
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await client.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "newValue", description)
         VALUES ($1, 'edit', 'shop', 'bulk-unassign-secondary', $2, $3)`,
        [
          auditId,
          JSON.stringify({ action: 'bulk-unassign-secondary', shopIds, orderbookerId, companyId, removed }),
          `Removed ${removed} secondary orderbooker assignment(s) — ${orderbookerName} (${companyName}) from ${shopIds.length} selected shop(s)`,
        ]
      );
    } catch (auditError) {
      console.error('Audit log creation failed (non-blocking):', auditError);
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true, removed, errors });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error bulk unassigning secondary orderbooker:', error);
    return NextResponse.json(
      { error: `Failed to bulk unassign secondary orderbooker: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
