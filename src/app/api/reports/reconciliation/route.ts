import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/reports/reconciliation?date=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const date = dateStr ? new Date(dateStr) : new Date();

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    // Get all transactions for the day
    const dayTransactions = await db.transaction.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        shop: {
          select: { id: true, name: true, area: true, orderbookerId: true },
        },
        creator: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate totals
    const totalCredit = dayTransactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalRecovery = dayTransactions
      .filter((t) => t.type === 'recovery')
      .reduce((sum, t) => sum + t.amount, 0);

    // Group by orderbooker
    const orderbookerIds = [...new Set(dayTransactions.map((t) => t.shop.orderbookerId))];
    const orderbookerStats = await Promise.all(
      orderbookerIds.map(async (obId) => {
        const ob = await db.user.findUnique({ where: { id: obId } });
        const obTransactions = dayTransactions.filter((t) => t.shop.orderbookerId === obId);
        const obCredit = obTransactions.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
        const obRecovery = obTransactions.filter((t) => t.type === 'recovery').reduce((s, t) => s + t.amount, 0);

        // Get shop-level details
        const shopDetails = await Promise.all(
          [...new Set(obTransactions.map((t) => t.shopId))].map(async (shopId) => {
            const shop = await db.shop.findUnique({ where: { id: shopId } });
            const shopTxns = obTransactions.filter((t) => t.shopId === shopId);
            const credit = shopTxns.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
            const recovery = shopTxns.filter((t) => t.type === 'recovery').reduce((s, t) => s + t.amount, 0);
            const prevBalance = shopTxns[0]?.previousBalance || shop?.balance || 0;
            return {
              shopId,
              shopName: shop?.name || 'Unknown',
              shopArea: shop?.area || '',
              previousBalance: Math.round(prevBalance * 100) / 100,
              credit: Math.round(credit * 100) / 100,
              recovery: Math.round(recovery * 100) / 100,
              closingBalance: Math.round((prevBalance + credit - recovery) * 100) / 100,
            };
          })
        );

        return {
          orderbookerId: obId,
          orderbookerName: ob?.name || 'Unknown',
          credit: Math.round(obCredit * 100) / 100,
          recovery: Math.round(obRecovery * 100) / 100,
          shops: shopDetails,
        };
      })
    );

    return NextResponse.json({
      date: startDate.toISOString().split('T')[0],
      totalCredit: Math.round(totalCredit * 100) / 100,
      totalRecovery: Math.round(totalRecovery * 100) / 100,
      netChange: Math.round((totalRecovery - totalCredit) * 100) / 100,
      totalTransactions: dayTransactions.length,
      orderbookers: orderbookerStats,
    });
  } catch (error) {
    console.error('Error generating reconciliation report:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
