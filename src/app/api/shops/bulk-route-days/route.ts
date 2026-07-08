import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const VALID_ROUTE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'saturday', 'sunday'];

// PATCH /api/shops/bulk-route-days
// Assign route days to shops in bulk
// Body: { shopIds?: string[], routeDays: string[], areaFilter?: string, assignAll?: boolean }
export async function PATCH(request: NextRequest) {
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

    // Build where clause
    let where: any = {};

    if (assignAll) {
      // Assign routeDays to ALL shops that currently have empty routeDays
      where.routeDays = { isEmpty: true };
      if (areaFilter) {
        where.area = { contains: areaFilter, mode: 'insensitive' };
      }
    } else if (shopIds && Array.isArray(shopIds) && shopIds.length > 0) {
      // Assign routeDays to specific shops
      where.id = { in: shopIds };
    } else if (areaFilter) {
      // Assign routeDays to all shops matching area
      where.area = { contains: areaFilter, mode: 'insensitive' };
    } else {
      return NextResponse.json({ error: 'Provide shopIds, areaFilter, or assignAll=true' }, { status: 400 });
    }

    const updateResult = await db.shop.updateMany({
      where,
      data: {
        routeDays: normalizedDays,
        updatedAt: new Date(),
      },
    });

    const resultCount = updateResult.count;

    // Audit log (best effort)
    try {
      await db.auditLog.create({
        data: {
          action: 'edit',
          entityType: 'shop',
          entityId: 'bulk-route-days',
          performedBy: performedBy || null,
          newValue: JSON.stringify({ action: 'bulk-route-days-assign', routeDays: normalizedDays, areaFilter, assignAll, count: resultCount }),
          description: `Bulk assigned routeDays [${normalizedDays.join(', ')}] to ${resultCount} shops${areaFilter ? ` in area "${areaFilter}"` : ''}`,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      updated: resultCount,
      routeDays: normalizedDays,
      areaFilter: areaFilter || null,
    });
  } catch (error) {
    console.error('Error bulk assigning route days:', error);
    return NextResponse.json({
      error: `Failed to bulk assign route days: ${(error as Error)?.message || 'Unknown error'}`,
    }, { status: 500 });
  }
}
