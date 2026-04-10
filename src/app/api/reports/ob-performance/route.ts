import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/reports/ob-performance?period=week|month|quarter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';

    // Calculate date range based on period
    const now = new Date();
    const startDate = new Date();

    if (period === 'week') {
      // Start of this week (Monday)
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
      startDate.setDate(now.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      // Start of this month
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'quarter') {
      // Start of this quarter
      const quarter = Math.floor(now.getMonth() / 3);
      startDate.setMonth(quarter * 3, 1);
      startDate.setHours(0, 0, 0, 0);
    }

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // Today's date range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Get all orderbookers (including inactive for comparison)
    const orderbookers = await db.user.findMany({
      where: { role: 'orderbooker' },
      select: { id: true, name: true, phone: true, status: true },
      orderBy: { name: 'asc' },
    });

    // For each orderbooker, compute aggregated stats
    const performanceData = await Promise.all(
      orderbookers.map(async (ob) => {
        // Get shops assigned to this orderbooker
        const shops = await db.shop.findMany({
          where: { orderbookerId: ob.id },
          select: { id: true, balance: true, status: true },
        });

        const totalShops = shops.length;
        const totalOutstanding = shops.reduce((sum, shop) => sum + shop.balance, 0);

        // Today's recovery
        const todayRecoveryTxns = await db.transaction.findMany({
          where: {
            type: 'recovery',
            createdBy: ob.id,
            createdAt: { gte: todayStart, lte: todayEnd },
          },
          select: { amount: true },
        });
        const todayRecovery = todayRecoveryTxns.reduce((sum, t) => sum + t.amount, 0);

        // Period recovery
        const periodRecoveryTxns = await db.transaction.findMany({
          where: {
            type: 'recovery',
            createdBy: ob.id,
            createdAt: { gte: startDate, lte: endDate },
          },
          select: { amount: true },
        });
        const periodRecovery = periodRecoveryTxns.reduce((sum, t) => sum + t.amount, 0);

        // Last active date (last transaction by this orderbooker)
        const lastTxn = await db.transaction.findFirst({
          where: { createdBy: ob.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        // Compute working days in period
        let workingDays: number;
        if (period === 'week') {
          workingDays = 6; // Mon-Sat
        } else if (period === 'month') {
          workingDays = 26; // ~26 working days
        } else {
          workingDays = 78; // ~78 working days in a quarter
        }

        // Average recovery per shop
        const avgRecoveryPerShop = totalShops > 0 ? periodRecovery / workingDays : 0;

        // Recovery rate: ratio of period recovery to outstanding
        // If outstanding is 0, recovery rate is 100%
        const recoveryRate = totalOutstanding > 0
          ? Math.min(100, (periodRecovery / totalOutstanding) * 100)
          : 100;

        return {
          orderbookerId: ob.id,
          orderbookerName: ob.name,
          orderbookerPhone: ob.phone,
          orderbookerStatus: ob.status,
          totalShops,
          totalOutstanding: Math.round(totalOutstanding * 100) / 100,
          todayRecovery: Math.round(todayRecovery * 100) / 100,
          periodRecovery: Math.round(periodRecovery * 100) / 100,
          lastActive: lastTxn ? lastTxn.createdAt.toISOString() : null,
          avgRecoveryPerShop: Math.round(avgRecoveryPerShop * 100) / 100,
          recoveryRate: Math.round(recoveryRate * 10) / 10,
        };
      })
    );

    // Sort by periodRecovery descending
    performanceData.sort((a, b) => b.periodRecovery - a.periodRecovery);

    return NextResponse.json(performanceData);
  } catch (error) {
    console.error('Error generating OB performance analytics:', error);
    return NextResponse.json({ error: 'Failed to generate OB performance analytics' }, { status: 500 });
  }
}
