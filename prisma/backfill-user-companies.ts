import { db } from '../src/lib/db';

/**
 * Backfill UserCompany records from existing User.companyId
 * This ensures existing orderbooker-company assignments are preserved
 * when migrating to the multi-company UserCompany junction table.
 */
async function backfillUserCompanies() {
  console.log('🔄 Backfilling UserCompany from existing User.companyId...');

  // Get all orderbookers with a companyId
  const orderbookers = await db.user.findMany({
    where: {
      role: 'orderbooker',
      companyId: { not: null },
    },
    select: {
      id: true,
      companyId: true,
    },
  });

  console.log(`Found ${orderbookers.length} orderbookers with companyId`);

  let created = 0;
  let skipped = 0;

  for (const ob of orderbookers) {
    if (!ob.companyId) continue;

    // Check if UserCompany record already exists
    const existing = await db.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: ob.id,
          companyId: ob.companyId,
        },
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    // Create UserCompany record
    await db.userCompany.create({
      data: {
        userId: ob.id,
        companyId: ob.companyId,
        isPrimary: true,
      },
    });
    created++;
    console.log(`  ✅ Created UserCompany: ${ob.id} -> ${ob.companyId} (primary)`);
  }

  console.log(`\n📊 Backfill complete: ${created} created, ${skipped} skipped`);
}

backfillUserCompanies()
  .catch(console.error)
  .finally(() => db.$disconnect());
