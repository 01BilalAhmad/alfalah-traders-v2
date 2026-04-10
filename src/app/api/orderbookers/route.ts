import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/orderbookers - List all orderbookers with their shop counts and balances
export async function GET() {
  try {
    const orderbookers = await db.user.findMany({
      where: { role: 'orderbooker' },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        status: true,
        createdAt: true,
        _count: {
          select: { orderbookerShops: { where: { status: 'active' } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get total outstanding for each orderbooker
    const orderbookersWithBalance = await Promise.all(
      orderbookers.map(async (ob) => {
        const shops = await db.shop.findMany({
          where: { orderbookerId: ob.id, status: 'active' },
          select: { balance: true },
        });
        const totalOutstanding = shops.reduce((sum, s) => sum + s.balance, 0);
        return {
          ...ob,
          totalShops: ob._count.orderbookerShops,
          totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        };
      })
    );

    return NextResponse.json(orderbookersWithBalance);
  } catch (error) {
    console.error('Error fetching orderbookers:', error);
    return NextResponse.json({ error: 'Failed to fetch orderbookers' }, { status: 500 });
  }
}

// POST /api/orderbookers - Create a new orderbooker
export async function POST(request: NextRequest) {
  try {
    const { username, password, name, phone } = await request.json();

    if (!username || !password || !name) {
      return NextResponse.json({ error: 'Username, password, and name are required' }, { status: 400 });
    }

    // Normalize username to lowercase
    const normalizedUsername = username.trim().toLowerCase();

    // Check if username already exists (case-insensitive)
    const existingUser = await db.user.findFirst({
      where: { username: normalizedUsername },
      select: { id: true, name: true },
    });
    if (existingUser) {
      return NextResponse.json({ error: `Username already exists (used by ${existingUser.name})` }, { status: 409 });
    }

    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    const orderbooker = await db.user.create({
      data: {
        username: normalizedUsername,
        password: hashedPassword,
        name,
        phone,
        role: 'orderbooker',
      },
    });

    // Audit log (best-effort)
    try {
      await db.auditLog.create({
        data: {
          action: 'create',
          entityType: 'user',
          entityId: orderbooker.id,
          newValue: JSON.stringify({ username: normalizedUsername, name, phone, role: 'orderbooker' }),
          description: `Created orderbooker: ${name}`,
        },
      });
    } catch { /* non-blocking */ }

    const { password: _, ...safeOrderbooker } = orderbooker;
    return NextResponse.json(safeOrderbooker, { status: 201 });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }
    console.error('Error creating orderbooker:', error);
    return NextResponse.json({ error: 'Failed to create orderbooker' }, { status: 500 });
  }
}

// PATCH /api/orderbookers - Update orderbooker (soft delete = status change)
export async function PATCH(request: NextRequest) {
  try {
    const { id, name, phone, status, password } = await request.json();

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Orderbooker not found' }, { status: 404 });
    }

    const updateData: Record<string, string> = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (status) updateData.status = status;
    if (password) {
      const bcrypt = await import('bcryptjs');
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updated = await db.user.update({
      where: { id },
      data: updateData,
    });

    // Audit log (best-effort)
    try {
      await db.auditLog.create({
        data: {
          action: 'edit',
          entityType: 'user',
          entityId: id,
          oldValue: JSON.stringify({ name: existing.name, phone: existing.phone, status: existing.status }),
          newValue: JSON.stringify(updateData),
          description: `Updated orderbooker: ${existing.name}`,
        },
      });
    } catch { /* non-blocking */ }

    const { password: _, ...safeUser } = updated;
    return NextResponse.json(safeUser);
  } catch (error) {
    console.error('Error updating orderbooker:', error);
    return NextResponse.json({ error: 'Failed to update orderbooker' }, { status: 500 });
  }
}
