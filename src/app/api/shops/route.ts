import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/shops?orderbookerId=xxx&routeDay=xxx&search=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const routeDay = searchParams.get('routeDay');
    const search = searchParams.get('search');
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const where: Record<string, unknown> = {};
    if (orderbookerId) where.orderbookerId = orderbookerId;
    if (routeDay) where.routeDay = routeDay;
    if (!includeInactive) where.status = 'active';
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { area: { contains: search } },
        { ownerName: { contains: search } },
      ];
    }

    const shops = await db.shop.findMany({
      where,
      include: {
        orderbooker: {
          select: { id: true, name: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(shops);
  } catch (error) {
    console.error('Error fetching shops:', error);
    return NextResponse.json({ error: 'Failed to fetch shops' }, { status: 500 });
  }
}

// POST /api/shops - Create a new shop
export async function POST(request: NextRequest) {
  try {
    const { name, ownerName, area, address, phone, routeDay, orderbookerId, creditLimit } = await request.json();

    if (!name || !routeDay || !orderbookerId) {
      return NextResponse.json({ error: 'Name, route day, and orderbooker are required' }, { status: 400 });
    }

    const shop = await db.shop.create({
      data: {
        name,
        ownerName,
        area,
        address,
        phone,
        routeDay,
        orderbookerId,
        creditLimit: creditLimit && creditLimit > 0 ? creditLimit : 0,
      },
    });

    // Audit log (best-effort)
    try {
      await db.auditLog.create({
        data: {
          action: 'create',
          entityType: 'shop',
          entityId: shop.id,
          newValue: JSON.stringify({ name, routeDay, orderbookerId }),
          description: `Created shop: ${name}`,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json(shop, { status: 201 });
  } catch (error) {
    console.error('Error creating shop:', error);
    return NextResponse.json({ error: 'Failed to create shop' }, { status: 500 });
  }
}

// PATCH /api/shops - Update shop (soft delete)
export async function PATCH(request: NextRequest) {
  try {
    const { id, name, ownerName, area, address, phone, routeDay, orderbookerId, status, creditLimit } = await request.json();

    const existing = await db.shop.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (ownerName !== undefined) updateData.ownerName = ownerName;
    if (area !== undefined) updateData.area = area;
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (routeDay) updateData.routeDay = routeDay;
    if (orderbookerId) updateData.orderbookerId = orderbookerId;
    if (status) updateData.status = status;
    if (creditLimit !== undefined) updateData.creditLimit = creditLimit > 0 ? creditLimit : 0;

    const updated = await db.shop.update({
      where: { id },
      data: updateData,
    });

    // Audit log (best-effort)
    try {
      await db.auditLog.create({
        data: {
          action: 'edit',
          entityType: 'shop',
          entityId: id,
          oldValue: JSON.stringify({ name: existing.name, area: existing.area, status: existing.status }),
          newValue: JSON.stringify(updateData),
          description: `Updated shop: ${existing.name}`,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating shop:', error);
    return NextResponse.json({ error: 'Failed to update shop' }, { status: 500 });
  }
}
