import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/shops?orderbookerId=xxx&routeDay=xxx&search=xxx&balanceOnly=true
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const routeDay = searchParams.get('routeDay');
    const search = searchParams.get('search');
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const balanceOnlyParam = searchParams.get('balanceOnly');
    const balanceOnly = balanceOnlyParam !== null
      ? balanceOnlyParam === 'true'
      : !!orderbookerId;

    const where: any = {};

    if (orderbookerId) {
      where.orderbookerId = orderbookerId;
    }
    if (routeDay) {
      where.routeDays = { has: routeDay.toLowerCase() };
    }
    if (!includeInactive) {
      where.status = 'active';
    }
    if (balanceOnly) {
      where.balance = { gt: 0 };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { area: { contains: search, mode: 'insensitive' } },
        { ownerName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const shops = await db.shop.findMany({
      where,
      include: {
        orderbooker: { select: { id: true, name: true } },
        companyBalances: {
          include: {
            company: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = shops.map((s) => ({
      id: s.id,
      name: s.name,
      ownerName: s.ownerName,
      area: s.area,
      address: s.address,
      phone: s.phone,
      routeDays: s.routeDays,
      orderbookerId: s.orderbookerId,
      balance: Number(s.balance),
      creditLimit: Number(s.creditLimit),
      status: s.status,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
      orderbooker: s.orderbooker ? { id: s.orderbooker.id, name: s.orderbooker.name } : null,
      companyBalances: s.companyBalances.map((cb) => ({
        companyId: cb.companyId,
        companyName: cb.company?.name || '',
        balance: Number(cb.balance),
        creditLimit: Number(cb.creditLimit),
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching shops:', error);
    return NextResponse.json({ error: 'Failed to fetch shops' }, { status: 500 });
  }
}

// POST /api/shops - Create a new shop
export async function POST(request: NextRequest) {
  try {
    const { name, ownerName, area, address, phone, routeDays, orderbookerId, creditLimit } = await request.json();

    if (!name || !routeDays || !orderbookerId) {
      return NextResponse.json({ error: 'Name, route days, and orderbooker are required' }, { status: 400 });
    }

    // Normalize routeDays to lowercase array
    const normalizedRouteDays = Array.isArray(routeDays)
      ? routeDays.map((d: string) => d.toLowerCase()).filter((d: string) => d)
      : [routeDays.toLowerCase()];

    // Prisma handles arrays natively!
    const shop = await db.shop.create({
      data: {
        name,
        ownerName: ownerName || null,
        area: area || null,
        address: address || null,
        phone: phone || null,
        routeDays: normalizedRouteDays,
        orderbookerId,
        creditLimit: creditLimit && creditLimit > 0 ? creditLimit : 0,
        status: 'active',
      },
    });

    // Audit log (best-effort)
    try {
      await db.auditLog.create({
        data: {
          action: 'create',
          entityType: 'shop',
          entityId: shop.id,
          newValue: JSON.stringify({ name, routeDays: normalizedRouteDays, orderbookerId }),
          description: `Created shop: ${name}`,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json(shop, { status: 201 });
  } catch (error) {
    console.error('Error creating shop:', error);
    return NextResponse.json({ error: `Failed to create shop: ${(error as Error)?.message || 'Unknown error'}` }, { status: 500 });
  }
}

// PATCH /api/shops - Update shop
export async function PATCH(request: NextRequest) {
  try {
    const { id, name, ownerName, area, address, phone, routeDays, orderbookerId, status, creditLimit } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
    }

    const existing = await db.shop.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const data: any = {};

    if (name) data.name = name;
    if (ownerName !== undefined) data.ownerName = ownerName;
    if (area !== undefined) data.area = area;
    if (address !== undefined) data.address = address;
    if (phone !== undefined) data.phone = phone;
    if (routeDays !== undefined) {
      const normalizedDays = Array.isArray(routeDays)
        ? routeDays.map((d: string) => d.toLowerCase()).filter((d: string) => d)
        : [routeDays.toLowerCase()];
      data.routeDays = normalizedDays;
    }
    if (orderbookerId) data.orderbookerId = orderbookerId;
    if (status) data.status = status;
    if (creditLimit !== undefined) data.creditLimit = creditLimit > 0 ? creditLimit : 0;
    data.updatedAt = new Date();

    // Prisma handles arrays natively!
    const updated = await db.shop.update({
      where: { id },
      data,
    });

    // Audit log (best-effort)
    try {
      await db.auditLog.create({
        data: {
          action: 'edit',
          entityType: 'shop',
          entityId: id,
          oldValue: JSON.stringify({ name: existing.name, area: existing.area, status: existing.status }),
          newValue: JSON.stringify({ name, area, status }),
          description: `Updated shop: ${existing.name}`,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating shop:', error);
    return NextResponse.json({ error: `Failed to update shop: ${(error as Error)?.message || 'Unknown error'}` }, { status: 500 });
  }
}
