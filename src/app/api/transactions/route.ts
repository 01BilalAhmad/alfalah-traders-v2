import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/transactions?shopId=xxx&orderbookerId=xxx&date=xxx&type=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get('shopId');
    const orderbookerId = searchParams.get('orderbookerId');
    const date = searchParams.get('date');
    const type = searchParams.get('type');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};
    if (shopId) where.shopId = shopId;
    if (type) where.type = type;
    if (orderbookerId) {
      where.shop = { orderbookerId };
    }
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt = { gte: startDate, lte: endDate };
    }

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where,
        include: {
          shop: {
            select: { id: true, name: true, area: true },
          },
          creator: {
            select: { id: true, name: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.transaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}

// POST /api/transactions - Create a transaction (credit or recovery)
export async function POST(request: NextRequest) {
  try {
    const { shopId, type, amount, description, createdBy, gpsLat, gpsLng, gpsAddress } = await request.json();

    if (!shopId || !type || !amount || !createdBy) {
      return NextResponse.json({ error: 'Shop, type, amount, and creator are required' }, { status: 400 });
    }

    if (type !== 'credit' && type !== 'recovery') {
      return NextResponse.json({ error: 'Type must be credit or recovery' }, { status: 400 });
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    const shop = await db.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const previousBalance = shop.balance;
    let newBalance: number;

    if (type === 'credit') {
      newBalance = previousBalance + amount;
    } else {
      newBalance = previousBalance - amount;
      if (newBalance < 0) {
        // Allow recovery to go to 0 but not negative in strict mode
        // For business flexibility, we allow negative but flag it
      }
    }

    // Use a transaction to ensure atomicity
    const transaction = await db.$transaction(async (tx) => {
      // Create transaction record
      const txn = await tx.transaction.create({
        data: {
          shopId,
          type,
          amount,
          previousBalance,
          newBalance: Math.round(newBalance * 100) / 100,
          description,
          createdBy,
          gpsLat: gpsLat || null,
          gpsLng: gpsLng || null,
          gpsAddress: gpsAddress || null,
        },
        include: {
          shop: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
        },
      });

      // Update shop balance
      await tx.shop.update({
        where: { id: shopId },
        data: { balance: Math.round(newBalance * 100) / 100 },
      });

      return txn;
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        action: type === 'credit' ? 'credit_post' : 'recovery_entry',
        entityType: 'transaction',
        entityId: transaction.id,
        performedBy: createdBy,
        newValue: JSON.stringify({
          shopName: shop.name,
          type,
          amount,
          previousBalance,
          newBalance: Math.round(newBalance * 100) / 100,
          gpsLat,
          gpsLng,
        }),
        description: `${type === 'credit' ? 'Credit posted' : 'Recovery collected'}: Rs. ${amount} at ${shop.name}`,
      },
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error('Error creating transaction:', error);
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }
}
