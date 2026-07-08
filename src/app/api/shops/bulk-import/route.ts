import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const VALID_ROUTE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'saturday', 'sunday'];

interface BulkShopRow {
  name: string;
  ownerName?: string;
  area?: string;
  address?: string;
  phone?: string;
  routeDays: string[];
  creditAmount?: number;
  creditLimit?: number;
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Use authenticated user ID from proxy header
    const createdBy = request.headers.get('x-auth-userid');
    const { orderbookerId, companyId, shops } = await request.json();

    if (!orderbookerId) {
      return NextResponse.json({ error: 'Orderbooker is required' }, { status: 400 });
    }
    if (!createdBy) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
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
      const compData = await db.company.findUnique({ where: { id: companyId } });
      if (!compData) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
      if (compData.status !== 'active') {
        return NextResponse.json({ error: `Company "${compData.name}" is inactive` }, { status: 400 });
      }
      company = { id: compData.id, name: compData.name };
    }

    // Validate orderbooker
    const orderbooker = await db.user.findUnique({ where: { id: orderbookerId } });
    if (!orderbooker) {
      return NextResponse.json({ error: 'Orderbooker not found' }, { status: 404 });
    }
    if (orderbooker.status !== 'active') {
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
      // Also handle if routeDays is already an array
      let routeDayParts: string[];
      if (Array.isArray(row.routeDays)) {
        routeDayParts = row.routeDays.map((d: string) => String(d).trim().toLowerCase()).filter((d: string) => d);
      } else {
        const routeDaysRaw = (row.routeDays || row.routeDay || '').toString().trim().toLowerCase();
        routeDayParts = routeDaysRaw.split(',').map((d: string) => d.trim()).filter((d: string) => d);
      }

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

      const creditLimit = row.creditLimit ? parseFloat(row.creditLimit) : 0;
      if (isNaN(creditLimit) || creditLimit < 0) {
        errors.push({ row: rowNumber, error: 'Credit limit must be a valid positive number or 0' });
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
        creditLimit,
      });
    }

    if (validatedShops.length === 0) {
      return NextResponse.json({
        error: 'No valid shops to import',
        details: errors,
      }, { status: 400 });
    }

    // Use Prisma transaction — it handles arrays natively!
    const result = await db.$transaction(async (tx) => {
      const createdShops: any[] = [];
      const importErrors: { row: number; name: string; error: string }[] = [];
      let totalCreditAmount = 0;

      for (const shop of validatedShops) {
        try {
          const initialBalance = shop.creditAmount || 0;

          // routeDays is a native String[] array in PostgreSQL
          const newShop = await tx.shop.create({
            data: {
              name: shop.name,
              ownerName: shop.ownerName,
              area: shop.area,
              address: shop.address,
              phone: shop.phone,
              routeDays: shop.routeDays,
              orderbookerId: orderbookerId,
              balance: initialBalance,
              creditLimit: shop.creditLimit || 0,
              status: 'active',
            },
          });

          createdShops.push(newShop);

          // Create ShopCompanyBalance entry if company is selected
          if (company) {
            await tx.shopCompanyBalance.create({
              data: {
                shopId: newShop.id,
                companyId: company.id,
                balance: initialBalance,
                creditLimit: shop.creditLimit || 0,
              },
            });
          }

          // Create opening balance transaction if credit > 0
          if (shop.creditAmount && shop.creditAmount > 0) {
            const description = company
              ? `Opening balance - Bulk import (${company.name})`
              : `Opening balance - Bulk import`;

            await tx.transaction.create({
              data: {
                shopId: newShop.id,
                type: 'credit',
                status: 'approved',
                amount: shop.creditAmount,
                previousBalance: 0,
                newBalance: shop.creditAmount,
                description: description,
                createdBy: createdBy,
                companyId: company?.id || null,
              },
            });

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

      // Audit log (best effort)
      try {
        await tx.auditLog.create({
          data: {
            action: 'create',
            entityType: 'shop',
            entityId: 'bulk',
            performedBy: createdBy,
            newValue: JSON.stringify({
              action: 'bulk-import',
              shopCount: createdShops.length,
              totalCredit: totalCreditAmount,
              orderbookerId,
              orderbookerName: orderbooker.name,
              companyId: company?.id || null,
              companyName: company?.name || null,
              errors: importErrors.length,
            }),
            description: `Bulk imported ${createdShops.length} shops to ${orderbooker.name}${company ? ` (${company.name})` : ''} (total credit: Rs. ${totalCreditAmount.toLocaleString()})`,
          },
        });
      } catch { /* non-blocking */ }

      return {
        createdShops,
        importErrors,
        totalCreditAmount,
      };
    });

    return NextResponse.json({
      success: true,
      created: result.createdShops.length,
      failed: result.importErrors.length,
      totalCredit: result.totalCreditAmount,
      orderbookerName: orderbooker.name,
      shops: result.createdShops.map((s: any) => ({
        id: s.id,
        name: s.name,
        ownerName: s.ownerName,
        area: s.area,
        routeDays: s.routeDays || [],
        balance: Number(s.balance),
      })),
      errors: result.importErrors,
      validationErrors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[BULK-IMPORT] Fatal error:', error);
    return NextResponse.json({
      error: `Failed to bulk import shops: ${(error as Error)?.message || 'Unknown error'}`,
    }, { status: 500 });
  }
}
