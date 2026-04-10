import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/reports/ledger?shopId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get('shopId');

    if (!shopId) {
      return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
    }

    const shop = await db.shop.findUnique({
      where: { id: shopId },
      include: {
        orderbooker: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const transactions = await db.transaction.findMany({
      where: { shopId },
      include: {
        creator: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalCredit = transactions.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
    const totalRecovery = transactions.filter((t) => t.type === 'recovery').reduce((s, t) => s + t.amount, 0);

    return NextResponse.json({
      shop: {
        id: shop.id,
        name: shop.name,
        ownerName: shop.ownerName,
        area: shop.area,
        address: shop.address,
        phone: shop.phone,
        routeDay: shop.routeDay,
        balance: shop.balance,
        orderbooker: shop.orderbooker,
      },
      transactions,
      summary: {
        totalCredit: Math.round(totalCredit * 100) / 100,
        totalRecovery: Math.round(totalRecovery * 100) / 100,
        totalTransactions: transactions.length,
        currentBalance: shop.balance,
      },
    });
  } catch (error) {
    console.error('Error generating ledger:', error);
    return NextResponse.json({ error: 'Failed to generate ledger' }, { status: 500 });
  }
}
