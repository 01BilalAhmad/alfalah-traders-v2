import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/reports/activity-timeline?limit=20
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const transactions = await db.transaction.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        shop: {
          select: { id: true, name: true, area: true },
        },
        creator: {
          select: { id: true, name: true, role: true },
        },
      },
    });

    const timeline = transactions.map((txn) => ({
      id: txn.id,
      type: txn.type,
      shopName: txn.shop.name,
      shopArea: txn.shop.area,
      amount: txn.amount,
      description: txn.description,
      createdBy: txn.creator.name,
      createdAt: txn.createdAt.toISOString(),
      balanceAfter: txn.newBalance,
    }));

    return NextResponse.json(timeline);
  } catch (error) {
    console.error('Error fetching activity timeline:', error);
    return NextResponse.json({ error: 'Failed to fetch activity timeline' }, { status: 500 });
  }
}
