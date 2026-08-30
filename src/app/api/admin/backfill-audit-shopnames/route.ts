import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAdmin } from '@/lib/auth-guard';

// POST /api/admin/backfill-audit-shopnames
// One-time migration: retroactively add shop names + IDs + txn type + orderbooker
// name to OLD AuditLog entries (action=recovery_approved / recovery_rejected)
// that were created before the audit-log fix landed.
//
// After running this, admins can search the audit log by shop name for past
// recovery approve/reject entries too — not just for new ones created after
// the fix.
//
// Idempotent: skips entries whose newValue JSON already contains shopNames.
export async function POST(request: NextRequest) {
  // Verify admin access
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const pool = getPool();

  try {
    // Step 1: Pull all recovery approve/reject audit entries
    const entriesRes = await pool.query(
      `SELECT id, action, "newValue", description
       FROM "AuditLog"
       WHERE action IN ('recovery_approved', 'recovery_rejected')
       ORDER BY "createdAt" ASC`
    );

    const entries = entriesRes.rows;
    let updated = 0;
    let skipped = 0;
    let errored = 0;
    let alreadyBackfilled = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const entry of entries) {
      try {
        if (!entry.newValue) {
          skipped++;
          continue;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(entry.newValue);
        } catch {
          errors.push({ id: entry.id, error: 'newValue is not valid JSON' });
          skipped++;
          continue;
        }

        // Idempotency: skip if already backfilled
        if (Array.isArray(parsed.shopNames)) {
          alreadyBackfilled++;
          continue;
        }

        const transactionIds: string[] = Array.isArray(parsed.transactionIds)
          ? parsed.transactionIds
          : (parsed.entityId ? [parsed.entityId] : []);

        if (transactionIds.length === 0) {
          errors.push({ id: entry.id, error: 'no transactionIds in newValue' });
          skipped++;
          continue;
        }

        // Step 2: Resolve shop names + IDs + txn type + orderbooker name
        const placeholders = transactionIds.map((_: unknown, i: number) => `$${i + 1}`).join(', ');
        const shopRes = await pool.query(
          `SELECT DISTINCT ON (s.id)
              s.id   AS "shopId",
              s.name AS "shopName",
              t.type AS "txnType",
              u.name AS "orderbookerName"
           FROM "Transaction" t
           LEFT JOIN "Shop"  s ON t."shopId"    = s.id
           LEFT JOIN "User"  u ON t."createdBy" = u.id
           WHERE t.id IN (${placeholders})`,
          transactionIds
        );

        if (shopRes.rows.length === 0) {
          errors.push({ id: entry.id, error: `no Shop found for txn ids ${transactionIds.join(',')}` });
          skipped++;
          continue;
        }

        const shopIds: string[] = shopRes.rows.map((r: any) => r.shopId).filter(Boolean);
        const shopNames: string[] = Array.from(new Set(
          shopRes.rows.map((r: any) => r.shopName).filter(Boolean)
        ));
        const txnType: string = shopRes.rows[0]?.txnType || 'recovery';
        const orderbookerName: string = shopRes.rows[0]?.orderbookerName || '';
        const totalAmount: number = Number(parsed.totalAmount ?? 0);
        const count: number = Number(parsed.count ?? transactionIds.length);
        const shopNamesDisplay = shopNames.length > 0
          ? shopNames.join(', ')
          : 'Unknown shop';

        // Step 3: Build new description + merged newValue JSON
        const verb = entry.action === 'recovery_approved' ? 'Approved' : 'Rejected';
        const newDescription = `${verb} ${count} ${txnType}(s) for shop(s): ${shopNamesDisplay} totaling Rs. ${Math.round(totalAmount)}`;

        const newNewValue = JSON.stringify({
          ...parsed,
          shopIds,
          shopNames,
          txnType,
          orderbookerName,
        });

        // Step 4: Update the AuditLog row
        await pool.query(
          `UPDATE "AuditLog" SET description = $1, "newValue" = $2 WHERE id = $3`,
          [newDescription, newNewValue, entry.id]
        );

        updated++;
      } catch (err: any) {
        errored++;
        errors.push({ id: entry.id, error: err?.message || String(err) });
      }
    }

    return NextResponse.json({
      success: true,
      totalScanned: entries.length,
      updated,
      alreadyBackfilled,
      skipped,
      errored,
      errors: errors.slice(0, 20), // cap error list to keep response small
    });
  } catch (error: any) {
    console.error('Backfill audit shopnames error:', error);
    return NextResponse.json({ error: error.message || 'Backfill failed' }, { status: 500 });
  }
}
