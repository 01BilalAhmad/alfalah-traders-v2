import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/shops/assign-orderbooker - Assign an additional orderbooker to a shop
export async function POST(request: NextRequest) {
  try {
    const { shopId, orderbookerId, companyId, routeDays } = await request.json();

    if (!shopId || !orderbookerId || !companyId) {
      return NextResponse.json(
        { error: 'shopId, orderbookerId, and companyId are required' },
        { status: 400 }
      );
    }

    // Verify shop exists
    const shop = await db.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Verify orderbooker exists and is active
    const orderbooker = await db.user.findUnique({ where: { id: orderbookerId } });
    if (!orderbooker) {
      return NextResponse.json({ error: 'Orderbooker not found' }, { status: 404 });
    }
    if (orderbooker.status !== 'active') {
      return NextResponse.json({ error: 'Orderbooker is inactive' }, { status: 400 });
    }

    // Verify company exists
    const company = await db.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Check if this is the same as the primary orderbooker
    if (shop.orderbookerId === orderbookerId) {
      return NextResponse.json(
        { error: `${orderbooker.name} is already the primary orderbooker for this shop` },
        { status: 400 }
      );
    }

    // Normalize routeDays
    const normalizedRouteDays = routeDays && Array.isArray(routeDays) && routeDays.length > 0
      ? routeDays.map((d: string) => d.toLowerCase()).filter((d: string) => d)
      : shop.routeDays || []; // Default to shop's route days if not specified

    // Create or update the assignment (upsert to handle duplicates)
    const assignment = await db.shopOrderbooker.upsert({
      where: {
        shopId_orderbookerId_companyId: {
          shopId,
          orderbookerId,
          companyId,
        },
      },
      create: {
        shopId,
        orderbookerId,
        companyId,
        routeDays: normalizedRouteDays,
      },
      update: {
        routeDays: normalizedRouteDays,
      },
    });

    // Also ensure ShopCompanyBalance exists for this shop-company pair
    const existingSCB = await db.shopCompanyBalance.findUnique({
      where: {
        shopId_companyId: { shopId, companyId },
      },
    });

    if (!existingSCB) {
      await db.shopCompanyBalance.create({
        data: {
          shopId,
          companyId,
          balance: 0,
          creditLimit: 0,
        },
      });
    }

    // Audit log (best-effort)
    try {
      await db.auditLog.create({
        data: {
          action: 'edit',
          entityType: 'shop',
          entityId: shopId,
          newValue: JSON.stringify({ orderbookerId, companyId, routeDays: normalizedRouteDays }),
          description: `Assigned ${orderbooker.name} (${company.name}) to shop: ${shop.name}`,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      assignment: {
        id: assignment.id,
        shopId,
        orderbookerId,
        orderbookerName: orderbooker.name,
        companyId,
        companyName: company.name,
        routeDays: normalizedRouteDays, // Return array to frontend
      },
    });
  } catch (error) {
    console.error('Error assigning orderbooker:', error);
    return NextResponse.json(
      { error: `Failed to assign orderbooker: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// DELETE /api/shops/assign-orderbooker - Remove an orderbooker assignment from a shop
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id'); // assignment ID
    const shopId = searchParams.get('shopId');
    const orderbookerId = searchParams.get('orderbookerId');
    const companyId = searchParams.get('companyId');

    // Can delete by assignment ID or by shopId+orderbookerId+companyId combo
    let where: any = {};

    if (id) {
      where.id = id;
    } else if (shopId && orderbookerId && companyId) {
      where.shopId_orderbookerId_companyId = { shopId, orderbookerId, companyId };
    } else {
      return NextResponse.json(
        { error: 'Either assignment ID or shopId+orderbookerId+companyId are required' },
        { status: 400 }
      );
    }

    const existing = await db.shopOrderbooker.findFirst({ where });
    if (!existing) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    // Get details for audit log
    const [shop, orderbooker, company] = await Promise.all([
      db.shop.findUnique({ where: { id: existing.shopId } }),
      db.user.findUnique({ where: { id: existing.orderbookerId } }),
      db.company.findUnique({ where: { id: existing.companyId } }),
    ]);

    await db.shopOrderbooker.delete({ where: { id: existing.id } });

    // Audit log (best-effort)
    try {
      await db.auditLog.create({
        data: {
          action: 'edit',
          entityType: 'shop',
          entityId: existing.shopId,
          oldValue: JSON.stringify({ orderbookerId: existing.orderbookerId, companyId: existing.companyId }),
          description: `Removed ${orderbooker?.name || 'orderbooker'} (${company?.name || 'company'}) from shop: ${shop?.name || 'unknown'}`,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing orderbooker assignment:', error);
    return NextResponse.json(
      { error: `Failed to remove assignment: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// GET /api/shops/assign-orderbooker?shopId=xxx - Get all orderbooker assignments for a shop
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get('shopId');

    if (!shopId) {
      return NextResponse.json({ error: 'shopId is required' }, { status: 400 });
    }

    const assignments = await db.shopOrderbooker.findMany({
      where: { shopId },
      include: {
        orderbooker: { select: { id: true, name: true, phone: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const result = assignments.map((a) => ({
      id: a.id,
      shopId: a.shopId,
      orderbookerId: a.orderbookerId,
      orderbookerName: a.orderbooker?.name || '',
      orderbookerPhone: a.orderbooker?.phone || '',
      companyId: a.companyId,
      companyName: a.company?.name || '',
      routeDays: a.routeDays || [],
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching orderbooker assignments:', error);
    return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 });
  }
}
