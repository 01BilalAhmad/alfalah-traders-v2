import { db } from '../src/lib/db';

/**
 * Backfill shop names into existing AuditLog entries for recovery_approved /
 * recovery_rejected actions.
 *
 * WHY THIS EXISTS:
 *   Before the audit-log fix landed (commit f16d611 on main), approve/reject
 *   audit entries only stored a generic description like
 *     "Rejected 1 transaction(s) totaling Rs. 2390"
 *   and the newValue JSON had only {action, transactionIds, count, totalAmount,
 *   rejectReason} — NO shop name, NO shop id, NO orderbooker name.
 *   Admins could not tell WHICH shop's recovery was rejected when reviewing
 *   the audit log later.
 *
 *   After the fix, new entries include shopNames / shopIds / txnType /
 *   orderbookerName in both the description and newValue JSON.
 *
 *   This script retroactively updates OLD entries so the admin can search
 *   the audit log by shop name for past rejects too.
 *
 * SAFETY:
 *   - Idempotent — skips entries whose newValue already contains "shopNames".
 *   - Only touches entries with action='recovery_approved' or 'recovery_rejected'.
 *   - Preserves all original fields in newValue (only ADDS shop fields + txnType
 *     + orderbookerName). Description is rewritten to the new format.
 *   - Prints a summary at the end. Errors are printed per-entry, not thrown.
 *
 * USAGE (from project root, with DATABASE_URL set in .env):
 *   bunx tsx prisma/backfill-audit-shopnames.ts
 *   # or
 *   npx tsx prisma/backfill-audit-shopnames.ts
 */

interface AuditRow {
  id: string;
  action: string;
  newValue: string | null;
  description: string | null;
}

interface ShopRow {
  shopId: string;
  shopName: string;
  txnType: string | null;
  orderbookerName: string | null;
}

async function backfillAuditShopnames() {
  console.log('🔄 Backfilling shop names into AuditLog recovery approve/reject entries...');

  // Step 1: Pull all recovery approve/reject audit entries
  const entries: AuditRow[] = await db.$queryRawUnsafe(
    `SELECT id, action, "newValue", description
     FROM "AuditLog"
     WHERE action IN ('recovery_approved', 'recovery_rejected')
     ORDER BY "createdAt" ASC`
  );

  console.log(`Found ${entries.length} recovery approve/reject audit entries`);

  let updated = 0;
  let skipped = 0;
  let errored = 0;
  let alreadyBackfilled = 0;

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
        console.warn(`  ⚠️  [${entry.id}] newValue is not valid JSON — skipping`);
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
        console.warn(`  ⚠️  [${entry.id}] no transactionIds in newValue — skipping`);
        skipped++;
        continue;
      }

      // Step 2: Resolve shop names + IDs + txn type + orderbooker name in one query.
      // Use $queryRawUnsafe with parameterised placeholders to safely expand the
      // array (Prisma's $queryRaw tagged template cannot expand arrays).
      const placeholders = transactionIds.map((_, i) => `$${i + 1}`).join(', ');
      const rows: ShopRow[] = await db.$queryRawUnsafe(
        `SELECT DISTINCT ON (s.id)
            s.id   AS "shopId",
            s.name AS "shopName",
            t.type AS "txnType",
            u.name AS "orderbookerName"
          FROM "Transaction" t
          LEFT JOIN "Shop"  s ON t."shopId"    = s.id
          LEFT JOIN "User"  u ON t."createdBy" = u.id
          WHERE t.id IN (${placeholders})`,
        ...transactionIds
      );

      if (rows.length === 0) {
        console.warn(`  ⚠️  [${entry.id}] no Shop found for txn ids ${transactionIds.join(',')} — skipping`);
        skipped++;
        continue;
      }

      const shopIds: string[] = rows.map((r) => r.shopId).filter(Boolean);
      const shopNames: string[] = Array.from(new Set(
        rows.map((r) => r.shopName).filter(Boolean)
      ));
      const txnType: string = rows[0]?.txnType || 'recovery';
      const orderbookerName: string = rows[0]?.orderbookerName || '';
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
      await db.$executeRawUnsafe(
        `UPDATE "AuditLog" SET description = $1, "newValue" = $2 WHERE id = $3`,
        newDescription,
        newNewValue,
        entry.id
      );

      updated++;
      console.log(`  ✅ [${entry.id}] ${newDescription}`);
    } catch (err: any) {
      errored++;
      console.error(`  ❌ [${entry.id}] error: ${err?.message || err}`);
    }
  }

  console.log('\n📊 Backfill complete:');
  console.log(`   Updated:            ${updated}`);
  console.log(`   Already backfilled: ${alreadyBackfilled}`);
  console.log(`   Skipped (no data):  ${skipped}`);
  console.log(`   Errored:            ${errored}`);
  console.log(`   Total scanned:      ${entries.length}`);
}

backfillAuditShopnames()
  .catch((err) => {
    console.error('Fatal error during backfill:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
