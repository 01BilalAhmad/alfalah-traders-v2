import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/reports/recovery-summary?date=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const date = dateStr ? new Date(dateStr) : new Date();

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    // Get all orderbookers
    const orderbookers = await db.user.findMany({
      where: { role: 'orderbooker', status: 'active' },
      select: { id: true, name: true, phone: true },
      orderBy: { name: 'asc' },
    });

    // For each orderbooker, get today's recovery details
    const recoverySummary = await Promise.all(
      orderbookers.map(async (ob) => {
        // Get shops for this orderbooker
        const shops = await db.shop.findMany({
          where: { orderbookerId: ob.id, status: 'active' },
          select: { id: true, name: true, area: true, balance: true },
          orderBy: { name: 'asc' },
        });

        const shopRecoveries = await Promise.all(
          shops.map(async (shop) => {
            const dayTxns = await db.transaction.findMany({
              where: {
                shopId: shop.id,
                createdAt: { gte: startDate, lte: endDate },
              },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                type: true,
                amount: true,
                previousBalance: true,
                newBalance: true,
                createdAt: true,
                description: true,
                gpsLat: true,
                gpsLng: true,
              },
            });

            const todayCredit = dayTxns.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
            const recoveryTxns = dayTxns.filter((t) => t.type === 'recovery');
            const todayRecovery = recoveryTxns.reduce((s, t) => s + t.amount, 0);
            const prevBalance = dayTxns.length > 0 ? dayTxns[dayTxns.length - 1].previousBalance : shop.balance;

            // Build recovery entries with GPS info
            const recoveryEntries = recoveryTxns.map((t) => ({
              id: t.id,
              amount: Math.round(t.amount * 100) / 100,
              time: t.createdAt.toISOString(),
              description: t.description,
              hasGps: !!(t.gpsLat && t.gpsLng),
              gpsLat: t.gpsLat,
              gpsLng: t.gpsLng,
            }));

            return {
              shopId: shop.id,
              shopName: shop.name,
              shopArea: shop.area,
              previousBalance: Math.round(prevBalance * 100) / 100,
              todayCredit: Math.round(todayCredit * 100) / 100,
              todayRecovery: Math.round(todayRecovery * 100) / 100,
              closingBalance: Math.round((prevBalance + todayCredit - todayRecovery) * 100) / 100,
              visited: recoveryTxns.length > 0,
              recoveryEntries,
            };
          })
        );

        const totalRecovery = shopRecoveries.reduce((s, shop) => s + shop.todayRecovery, 0);
        const visitedShops = shopRecoveries.filter((s) => s.visited).length;

        return {
          orderbookerId: ob.id,
          orderbookerName: ob.name,
          orderbookerPhone: ob.phone,
          totalRecovery: Math.round(totalRecovery * 100) / 100,
          totalShops: shops.length,
          visitedShops,
          shops: shopRecoveries,
        };
      })
    );

    const grandTotalRecovery = recoverySummary.reduce((s, ob) => s + ob.totalRecovery, 0);

    return NextResponse.json({
      date: startDate.toISOString().split('T')[0],
      grandTotalRecovery: Math.round(grandTotalRecovery * 100) / 100,
      orderbookers: recoverySummary,
    });
  } catch (error) {
    console.error('Error generating recovery summary:', error);
    return NextResponse.json({ error: 'Failed to generate recovery summary' }, { status: 500 });
  }
}
