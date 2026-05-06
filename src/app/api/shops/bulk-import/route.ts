import { NextRequest, NextResponse } from 'next/server';
import { getPgClient, toPgArray } from '@/lib/pg';
import crypto from 'crypto';

const VALID_ROUTE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'saturday', 'sunday'];

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

interface BulkShopRow {
  name: string;
  ownerName?: string;
  area?: string;
  address?: string;
  phone?: string;
  routeDays: string[]; // Changed from routeDay: string to routeDays: string[]
  creditAmount?: number;
}

export async function POST(request: NextRequest) {
  let client;
  try {
    const { orderbookerId, companyId, shops, createdBy } = await request.json();

    if (!orderbookerId) {
      return NextResponse.json({ error: 'Orderbooker is required' }, { status: 400 });
    }
    if (!createdBy) {
      return NextResponse.json({ error: 'Creator (admin) is required' }, { status: 400 });
    }
    if (!shops || !Array.isArray(shops) || shops.length === 0) {
      return NextResponse.json({ error: 'Shops array is required and must not be empty' }, { status: 400 });
    }
    if (shops.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 shops per import' }, { status: 400 });
    }

    // Validate company if provided
    let company: { id: string; name: string } | null = null;
    if (companyId) {
      const compRes = await getPgClient();
      await compRes.connect();
      const compData = await compRes.query(
        `SELECT id, name, status FROM "Company" WHERE id = $1`,
        [companyId]
      );
      await compRes.end();
      if (compData.rows.length === 0) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
      if (compData.rows[0].status !== 'active') {
        return NextResponse.json({ error: `Company "${compData.rows[0].name}" is inactive` }, { status: 400 });
      }
      company = compData.rows[0];
    }

    client = getPgClient();
    await client.connect();

    const obRes = await client.query(
      `SELECT id, name, status FROM "User" WHERE id = $1`,
      [orderbookerId]
    );
    if (obRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'Orderbooker not found' }, { status: 404 });
    }
    const orderbooker = obRes.rows[0];
    if (orderbooker.status !== 'active') {
      await client.end();
      return NextResponse.json({
        error: `"${orderbooker.name}" is inactive. Please activate them first or choose a different orderbooker.`,
      }, { status: 400 });
    }

    const validatedShops: (BulkShopRow & { rowNumber: number })[] = [];
    const errors: { row: number; error: string } = [];

    for (let i = 0; i < shops.length; i++) {
      const row = shops[i];
      const rowNumber = i + 2;
      const name = (row.name || '').toString().trim();
      // Parse routeDays - support comma-separated values (e.g., "monday,thursday")
      const routeDaysRaw = (row.routeDays || row.routeDay || '').toString().trim().toLowerCase();
      const routeDayParts = routeDaysRaw.split(',').map((d: string) => d.trim()).filter((d: string) => d);

      if (!name) {
        errors.push({ row: rowNumber, error: 'Shop name is required' });
        continue;
      }

      if (routeDayParts.length === 0) {
        errors.push({ row: rowNumber, error: `At least one route day is required. Valid: ${VALID_ROUTE_DAYS.join(', ')}` });
        continue;
      }

      // Validate each day part
      const validatedDays: string[] = [];
      let hasInvalidDay = false;
      for (const part of routeDayParts) {
        const matched = VALID_ROUTE_DAYS.find(
          (d) => d === part || d.startsWith(part)
        );
        if (!matched) {
          errors.push({
            row: rowNumber,
            error: `Invalid route day "${part}". Valid: ${VALID_ROUTE_DAYS.join(', ')}`,
          });
          hasInvalidDay = true;
        } else {
          validatedDays.push(matched);
        }
      }
      if (hasInvalidDay) continue;

      const creditAmount = row.creditAmount ? parseFloat(row.creditAmount) : 0;
      if (isNaN(creditAmount) || creditAmount < 0) {
        errors.push({ row: rowNumber, error: 'Credit amount must be a valid positive number or 0' });
        continue;
      }

      validatedShops.push({
        rowNumber,
        name,
        ownerName: (row.ownerName || '').toString().trim() || null,
        area: (row.area || '').toString().trim() || null,
        address: (row.address || '').toString().trim() || null,
        phone: (row.phone || '').toString().trim() || null,
        routeDays: [...new Set(validatedDays)], // Remove duplicates
        creditAmount,
      });
    }

    if (validatedShops.length === 0) {
      await client.end();
      return NextResponse.json({
        error: 'No valid shops to import',
        details: errors,
      }, { status: 400 });
    }

    await client.query('BEGIN');

    const createdShops: any[] = [];
    const importErrors: { row: number; name: string; error: string }[] = [];
    let totalCreditAmount = 0;

    for (const shop of validatedShops) {
      try {
        const shopId = generateId('shop');
        const now = new Date().toISOString();
        const initialBalance = shop.creditAmount || 0;

        const shopRes = await client.query(
          `INSERT INTO "Shop" (id, name, "ownerName", area, address, phone, "routeDays", "orderbookerId", balance, "creditLimit", status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, 0, 'active', $10, $11)
           RETURNING *`,
          [shopId, shop.name, shop.ownerName, shop.area, shop.address, shop.phone, toPgArray(shop.routeDays), orderbookerId, initialBalance, now, now]
        );

        createdShops.push(shopRes.rows[0]);

        // Create ShopCompanyBalance entry if company is selected
        if (company) {
          const scbId = generateId('scb');
          await client.query(
            `INSERT INTO "ShopCompanyBalance" (id, "shopId", "companyId", balance, "creditLimit")
             VALUES ($1, $2, $3, $4, 0)`,
            [scbId, shopId, company.id, initialBalance]
          );
        }

        if (shop.creditAmount && shop.creditAmount > 0) {
          const txnId = generateId('txn');
          const description = company
            ? `Opening balance - Bulk import (${company.name})`
            : `Opening balance - Bulk import`;

          // Include companyId in transaction if company is selected
          if (company) {
            await client.query(
              `INSERT INTO "Transaction" (id, "shopId", type, status, amount, "previousBalance", "newBalance", description, "createdBy", "companyId", "createdAt")
               VALUES ($1, $2, 'credit', 'approved', $3, 0, $4, $5, $6, $7, $8)`,
              [txnId, shopId, shop.creditAmount, shop.creditAmount, description, createdBy, company.id, now]
            );
          } else {
            await client.query(
              `INSERT INTO "Transaction" (id, "shopId", type, status, amount, "previousBalance", "newBalance", description, "createdBy", "createdAt")
               VALUES ($1, $2, 'credit', 'approved', $3, 0, $4, $5, $6, $7)`,
              [txnId, shopId, shop.creditAmount, shop.creditAmount, description, createdBy, now]
            );
          }

          totalCreditAmount += shop.creditAmount;
        }
      } catch (err: any) {
        console.error(`[BULK-IMPORT] Failed to insert shop "${shop.name}":`, err?.message || err);
        importErrors.push({
          row: shop.rowNumber,
          name: shop.name,
          error: err?.message || 'Failed to create shop',
        });
      }
    }

    await client.query('COMMIT');

    try {
      const auditId = generateId('audit');
      await client.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "performedBy", "newValue", description)
         VALUES ($1, 'create', 'shop', 'bulk', $2, $3)`,
        [
          auditId,
          createdBy,
          JSON.stringify({
            action: 'bulk-import',
            shopCount: createdShops.length,
            totalCredit: totalCreditAmount,
            orderbookerId,
            orderbookerName: orderbooker.name,
            companyId: company?.id || null,
            companyName: company?.name || null,
            errors: importErrors.length,
          }),
          `Bulk imported ${createdShops.length} shops to ${orderbooker.name}${company ? ` (${company.name})` : ''} (total credit: Rs. ${totalCreditAmount.toLocaleString()})`,
        ]
      );
    } catch { /* non-blocking */ }

    await client.end();

    return NextResponse.json({
      success: true,
      created: createdShops.length,
      failed: importErrors.length,
      totalCredit: totalCreditAmount,
      orderbookerName: orderbooker.name,
      shops: createdShops.map((s: any) => ({
        id: s.id,
        name: s.name,
        ownerName: s.ownerName,
        area: s.area,
        routeDays: s.routeDays,
        balance: Number(s.balance),
      })),
      errors: importErrors,
      validationErrors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
      await client.end().catch(() => {});
    }
    console.error('[BULK-IMPORT] Fatal error:', error);
    return NextResponse.json({ error: `Failed to bulk import shops: ${(error as Error)?.message || 'Unknown error'}` }, { status: 500 });
  }
}
