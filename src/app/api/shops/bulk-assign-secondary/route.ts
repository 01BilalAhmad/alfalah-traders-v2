import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/pg';
import crypto from 'crypto';

// POST /api/shops/bulk-assign-secondary - Bulk assign a secondary orderbooker to multiple shops for a specific company
export async function POST(request: NextRequest) {
  const client = await getClient();
  try {
    const { shopIds, orderbookerId, companyId, routeDays, createCompanyBalance } = await request.json();

    // Validate required fields
    if (!shopIds || !Array.isArray(shopIds) || shopIds.length === 0) {
      return NextResponse.json({ error: 'shopIds array is required' }, { status: 400 });
    }

    if (!orderbookerId) {
      return NextResponse.json({ error: 'orderbookerId is required' }, { status: 400 });
    }

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    await client.query('BEGIN');

    // Verify the orderbooker exists and is active
    const obRes = await client.query(
      `SELECT id, name, status FROM "User" WHERE id = $1`,
      [orderbookerId]
    );

    if (obRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Orderbooker not found. Please select a valid orderbooker.' }, { status: 404 });
    }

    const orderbooker = obRes.rows[0];
    if (orderbooker.status !== 'active') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `"${orderbooker.name}" is currently inactive. Please activate them first or choose a different orderbooker.` }, { status: 400 });
    }

    // Verify company exists
    const compRes = await client.query(
      `SELECT id, name FROM "Company" WHERE id = $1`,
      [companyId]
    );

    if (compRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Company not found. Please select a valid company.' }, { status: 404 });
    }

    const company = compRes.rows[0];

    // Normalize routeDays
    const normalizedRouteDays = routeDays && Array.isArray(routeDays) && routeDays.length > 0
      ? routeDays.map((d: string) => d.toLowerCase()).filter((d: string) => d)
      : null;

    let assigned = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process each shop
    for (const shopId of shopIds) {
      try {
        // Check if shop exists and get its primary orderbooker
        const shopRes = await client.query(
          `SELECT id, name, "orderbookerId", "routeDays" FROM "Shop" WHERE id = $1`,
          [shopId]
        );

        if (shopRes.rows.length === 0) {
          errors.push(`Shop ${shopId} not found`);
          continue;
        }

        const shop = shopRes.rows[0];
        const shopRouteDays: string[] = shop.routeDays || [];

        // Check if the shop's primary orderbooker is the same as the one being assigned
        if (shop.orderbookerId === orderbookerId) {
          skipped++;
          continue;
        }

        // Check if this assignment already exists
        const existingRes = await client.query(
          `SELECT id FROM "ShopOrderbooker" WHERE "shopId" = $1 AND "orderbookerId" = $2 AND "companyId" = $3`,
          [shopId, orderbookerId, companyId]
        );

        if (existingRes.rows.length > 0) {
          // Update existing assignment with new routeDays if provided
          if (normalizedRouteDays) {
            await client.query(
              `UPDATE "ShopOrderbooker" SET "routeDays" = $1 WHERE "shopId" = $2 AND "orderbookerId" = $3 AND "companyId" = $4`,
              [normalizedRouteDays, shopId, orderbookerId, companyId]
            );
          }
          skipped++;
          continue;
        }

        // Determine routeDays to use: provided or fall back to shop's default
        const routeDaysToUse = normalizedRouteDays || shopRouteDays;

        // Insert new assignment
        const assignmentId = `sob_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
        const nowIso = new Date();
        await client.query(
          `INSERT INTO "ShopOrderbooker" (id, "shopId", "orderbookerId", "companyId", "routeDays", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            assignmentId,
            shopId,
            orderbookerId,
            companyId,
            routeDaysToUse,
            nowIso,
            nowIso,
          ]
        );

        // Optionally create ShopCompanyBalance if it doesn't exist
        if (createCompanyBalance) {
          const scbRes = await client.query(
            `SELECT id FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND "companyId" = $2`,
            [shopId, companyId]
          );

          if (scbRes.rows.length === 0) {
            const scbId = `scb_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
            await client.query(
              `INSERT INTO "ShopCompanyBalance" (id, "shopId", "companyId", balance, "creditLimit", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, 0, 0, $4, $5)`,
              [
                scbId,
                shopId,
                companyId,
                nowIso,
                nowIso,
              ]
            );
          }
        }

        assigned++;
      } catch (shopError) {
        const msg = shopError instanceof Error ? shopError.message : 'Unknown error';
        errors.push(`Shop ${shopId}: ${msg}`);
      }
    }

    // Create audit log entry (best-effort)
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await client.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "newValue", description)
         VALUES ($1, 'edit', 'shop', 'bulk-secondary', $2, $3)`,
        [
          auditId,
          JSON.stringify({ action: 'bulk-assign-secondary', shopIds, orderbookerId, companyId, assigned, skipped }),
          `Bulk assigned ${orderbooker.name} (${company.name}) as secondary orderbooker to ${assigned} shops (${skipped} skipped)`,
        ]
      );
    } catch (auditError) {
      console.error('Audit log creation failed (non-blocking):', auditError);
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true, assigned, skipped, errors });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error bulk assigning secondary orderbooker:', error);
    return NextResponse.json(
      { error: `Failed to bulk assign secondary orderbooker: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
