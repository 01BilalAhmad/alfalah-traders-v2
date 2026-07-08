import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/shops?orderbookerId=xxx&routeDay=xxx&search=xxx&balanceOnly=true&showZeroBalance=true&companyId=yyy
// When orderbookerId is present, zero-balance shops are hidden by default
// (only shown if they had a transaction today, meaning the orderbooker visited them)
// Use showZeroBalance=true to override and show all shops (for admin views)
// When companyId is provided, only return shops that have a balance for that company
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const routeDay = searchParams.get('routeDay');
    const search = searchParams.get('search');
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const balanceOnly = searchParams.get('balanceOnly') === 'true';
    const showZeroBalance = searchParams.get('showZeroBalance') === 'true';
    const companyId = searchParams.get('companyId');

    // When orderbookerId is present (orderbooker view), hide zero-balance shops
    // unless showZeroBalance=true is explicitly passed (admin might need all shops)
    const shouldHideZero = !!orderbookerId && !showZeroBalance && !balanceOnly;

    // Build base where clause for primary shops (where orderbookerId matches Shop.orderbookerId)
    const baseWhere: any = {};

    if (routeDay) {
      baseWhere.routeDays = { has: routeDay.toLowerCase() };
    }
    if (!includeInactive) {
      baseWhere.status = 'active';
    }
    if (balanceOnly) {
      baseWhere.balance = { gt: 0 };
    }
    if (search) {
      baseWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { area: { contains: search, mode: 'insensitive' } },
        { ownerName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const include = {
      orderbooker: { select: { id: true, name: true } },
      companyBalances: {
        include: {
          company: { select: { id: true, name: true } },
        },
      },
      assignedOrderbookers: {
        include: {
          orderbooker: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
        },
      },
    };

    const formatShop = (s: any) => ({
      id: s.id,
      name: s.name,
      ownerName: s.ownerName,
      area: s.area,
      address: s.address,
      phone: s.phone,
      routeDays: s.routeDays || [],
      orderbookerId: s.orderbookerId,
      balance: Number(s.balance),
      creditLimit: Number(s.creditLimit),
      status: s.status,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
      orderbooker: s.orderbooker ? { id: s.orderbooker.id, name: s.orderbooker.name } : null,
      companyBalances: s.companyBalances.map((cb: any) => ({
        companyId: cb.companyId,
        companyName: cb.company?.name || '',
        balance: Number(cb.balance),
        creditLimit: Number(cb.creditLimit),
      })),
      assignedOrderbookers: (s.assignedOrderbookers || []).map((a: any) => ({
        id: a.id,
        orderbookerId: a.orderbookerId,
        orderbookerName: a.orderbooker?.name || '',
        companyId: a.companyId,
        companyName: a.company?.name || '',
        routeDays: a.routeDays || [],
      })),
    });

    // If hiding zero-balance shops, get shop IDs that had transactions today (so we keep them visible)
    let todaysActiveShopIds: string[] = [];
    if (shouldHideZero) {
      // Helper: get today's Pakistan timezone day boundaries
      const now = new Date();
      const pktMs = now.getTime() + 5 * 60 * 60 * 1000; // UTC+5
      const pktNow = new Date(pktMs);
      const y = pktNow.getUTCFullYear();
      const m = pktNow.getUTCMonth();
      const d = pktNow.getUTCDate();
      const start = new Date(Date.UTC(y, m, d, -5, 0, 0, 0));
      const end = new Date(Date.UTC(y, m, d, 18, 59, 59, 999));

      const activeTxns = await db.transaction.findMany({
        where: {
          createdAt: { gte: start, lte: end },
        },
        select: { shopId: true },
        distinct: ['shopId'],
      });
      todaysActiveShopIds = activeTxns.map((t: { shopId: string }) => t.shopId);
    }

    if (orderbookerId) {
      // Fetch primary shops (where this user is the main orderbooker)
      const primaryWhere: any = { ...baseWhere, orderbookerId };

      // Apply zero-balance filter: show if balance > 0 OR had transaction today
      if (shouldHideZero) {
        primaryWhere.OR = [
          { balance: { gt: 0 } },
          ...(todaysActiveShopIds.length > 0 ? [{ id: { in: todaysActiveShopIds } }] : []),
        ];
      }

      // Apply companyId filter for primary shops:
      // Only include shops that have a ShopCompanyBalance entry for this company
      if (companyId) {
        primaryWhere.companyBalances = {
          some: { companyId },
        };
      }

      const primaryShops = await db.shop.findMany({
        where: primaryWhere,
        include,
        orderBy: { name: 'asc' },
      });

      // Fetch secondary shops (where this user is assigned via ShopOrderbooker junction table)
      // Build junction filter
      const junctionWhere: any = {
        orderbookerId,
      };
      if (routeDay) {
        junctionWhere.routeDays = { has: routeDay.toLowerCase() };
      }
      // Apply companyId filter for secondary shops:
      // Only include ShopOrderbooker entries for this company
      if (companyId) {
        junctionWhere.companyId = companyId;
      }

      const assignments = await db.shopOrderbooker.findMany({
        where: junctionWhere,
        include: {
          shop: {
            include,
          },
        },
      });

      // Filter shops by additional criteria (status, balance, search)
      const secondaryShops = assignments
        .filter((a) => {
          const shop = a.shop;
          if (!includeInactive && shop.status !== 'active') return false;
          if (balanceOnly && shop.balance <= 0) return false;
          // hideZeroBalance: hide shops with permanently zero balance (no transactions today)
          if (shouldHideZero && shop.balance <= 0 && !todaysActiveShopIds.includes(shop.id)) return false;
          if (search) {
            const q = search.toLowerCase();
            return (
              shop.name.toLowerCase().includes(q) ||
              (shop.area || '').toLowerCase().includes(q) ||
              (shop.ownerName || '').toLowerCase().includes(q)
            );
          }
          return true;
        })
        .map((a) => a.shop);

      // Merge and deduplicate (a shop might appear in both primary and secondary)
      const seenIds = new Set(primaryShops.map((s) => s.id));
      const allShops = [...primaryShops];
      for (const shop of secondaryShops) {
        if (!seenIds.has(shop.id)) {
          seenIds.add(shop.id);
          allShops.push(shop);
        }
      }

      // Sort by name
      allShops.sort((a, b) => a.name.localeCompare(b.name));

      // When companyId is specified, filter out shops whose company-specific balance is 0
      // (the shop may have total balance > 0 but 0 balance for the selected company)
      let resultShops = allShops;
      if (companyId) {
        resultShops = allShops.filter((shop) => {
          const companyBal = shop.companyBalances?.find(
            (cb: any) => cb.companyId === companyId
          );
          // Include shop if it has a non-zero balance for this company, OR had a transaction today
          const companyBalance = companyBal ? Number(companyBal.balance) : 0;
          return companyBalance > 0 || todaysActiveShopIds.includes(shop.id);
        });
      }

      return NextResponse.json(resultShops.map(formatShop));
    }

    // No orderbooker filter — return all shops normally
    const shops = await db.shop.findMany({
      where: baseWhere,
      include,
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(shops.map(formatShop));
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

// DELETE /api/shops?id=xxx&deletedBy=xxx - Permanently delete a shop and all related records
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const deletedBy = searchParams.get('deletedBy');

    if (!id) {
      return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
    }

    const existing = await db.shop.findUnique({
      where: { id },
      include: {
        orderbooker: { select: { id: true, name: true } },
        companyBalances: { include: { company: { select: { id: true, name: true } } } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Capture shop data for audit log before deletion
    const shopSnapshot = {
      id: existing.id,
      name: existing.name,
      ownerName: existing.ownerName,
      area: existing.area,
      balance: Number(existing.balance),
      creditLimit: Number(existing.creditLimit),
      status: existing.status,
      orderbooker: existing.orderbooker?.name,
      companyBalances: existing.companyBalances.map(cb => ({
        company: cb.company?.name,
        balance: Number(cb.balance),
      })),
    };

    // Delete related Transactions first (no cascade on Transaction → Shop)
    const deletedTxns = await db.transaction.deleteMany({ where: { shopId: id } });

    // Delete the shop (cascade will handle ShopNote, ShopVisit, ShopCompanyBalance, ShopOrderbooker)
    await db.shop.delete({ where: { id } });

    // Delete audit logs referencing this shop
    await db.auditLog.deleteMany({ where: { entityType: 'shop', entityId: id } });

    // Create audit log for the deletion
    try {
      await db.auditLog.create({
        data: {
          action: 'delete',
          entityType: 'shop',
          entityId: id,
          performedBy: deletedBy || undefined,
          oldValue: JSON.stringify(shopSnapshot),
          description: `Permanently deleted shop: ${existing.name} (owner: ${existing.ownerName || 'N/A'})`,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      deletedShop: shopSnapshot,
      deletedTransactionsCount: deletedTxns.count,
    });
  } catch (error) {
    console.error('Error deleting shop:', error);
    return NextResponse.json({ error: `Failed to delete shop: ${(error as Error)?.message || 'Unknown error'}` }, { status: 500 });
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
