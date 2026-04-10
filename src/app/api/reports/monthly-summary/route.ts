import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/reports/monthly-summary?month=2026-04
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('month');

    // Parse month (YYYY-MM) or default to current month
    const now = new Date();
    let year: number;
    let month: number;

    if (monthParam) {
      const parts = monthParam.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
    } else {
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
    }

    // Calculate month boundaries
    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Fetch all transactions in the month with shop and creator info
    const monthTransactions = await db.transaction.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        shop: {
          select: { id: true, name: true, area: true },
        },
        creator: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate totals
    const creditTxns = monthTransactions.filter((t) => t.type === 'credit');
    const recoveryTxns = monthTransactions.filter((t) => t.type === 'recovery');

    const totalCredit = creditTxns.reduce((sum, t) => sum + t.amount, 0);
    const totalRecovery = recoveryTxns.reduce((sum, t) => sum + t.amount, 0);
    const netChange = totalCredit - totalRecovery;

    // Get unique active shop count (shops that had at least one transaction)
    const activeShopIds = new Set(monthTransactions.map((t) => t.shopId));
    const shopCount = activeShopIds.size;

    // Get unique active orderbooker count
    const activeOBIds = new Set(monthTransactions.map((t) => t.createdBy));
    const activeOrderbookers = activeOBIds.size;

    // Daily breakdown
    const dailyMap: Record<string, { credit: number; recovery: number }> = {};
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      dailyMap[key] = { credit: 0, recovery: 0 };
    }
    monthTransactions.forEach((t) => {
      const dayKey = t.createdAt.toISOString().split('T')[0];
      if (dailyMap[dayKey]) {
        if (t.type === 'credit') {
          dailyMap[dayKey].credit += t.amount;
        } else {
          dailyMap[dayKey].recovery += t.amount;
        }
      }
    });

    const dailyBreakdown = Object.entries(dailyMap)
      .map(([date, data]) => ({
        date,
        credit: Math.round(data.credit * 100) / 100,
        recovery: Math.round(data.recovery * 100) / 100,
        net: Math.round((data.credit - data.recovery) * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top recovery shops (by total recovery amount)
    const shopRecoveryMap: Record<string, { shopName: string; area: string; recovery: number; orderbookerName: string }> = {};
    recoveryTxns.forEach((t) => {
      const key = t.shopId;
      if (!shopRecoveryMap[key]) {
        shopRecoveryMap[key] = {
          shopName: t.shop.name,
          area: t.shop.area || '',
          recovery: 0,
          orderbookerName: t.creator.name,
        };
      }
      shopRecoveryMap[key].recovery += t.amount;
    });
    const topRecoveryShops = Object.values(shopRecoveryMap)
      .sort((a, b) => b.recovery - a.recovery)
      .slice(0, 5)
      .map((s) => ({ ...s, recovery: Math.round(s.recovery * 100) / 100 }));

    // Top credit shops (by total credit amount)
    const shopCreditMap: Record<string, { shopName: string; area: string; credit: number; orderbookerName: string }> = {};
    creditTxns.forEach((t) => {
      const key = t.shopId;
      if (!shopCreditMap[key]) {
        shopCreditMap[key] = {
          shopName: t.shop.name,
          area: t.shop.area || '',
          credit: 0,
          orderbookerName: t.creator.name,
        };
      }
      shopCreditMap[key].credit += t.amount;
    });
    const topCreditShops = Object.values(shopCreditMap)
      .sort((a, b) => b.credit - a.credit)
      .slice(0, 5)
      .map((s) => ({ ...s, credit: Math.round(s.credit * 100) / 100 }));

    // Orderbooker breakdown
    const obMap: Record<string, { name: string; credit: number; recovery: number; shopIds: Set<string> }> = {};
    monthTransactions.forEach((t) => {
      const key = t.createdBy;
      if (!obMap[key]) {
        obMap[key] = { name: t.creator.name, credit: 0, recovery: 0, shopIds: new Set() };
      }
      obMap[key].shopIds.add(t.shopId);
      if (t.type === 'credit') {
        obMap[key].credit += t.amount;
      } else {
        obMap[key].recovery += t.amount;
      }
    });
    const orderbookerBreakdown = Object.values(obMap)
      .map((ob) => ({
        name: ob.name,
        credit: Math.round(ob.credit * 100) / 100,
        recovery: Math.round(ob.recovery * 100) / 100,
        shops: ob.shopIds.size,
      }))
      .sort((a, b) => b.credit - a.credit);

    return NextResponse.json({
      month: `${year}-${String(month).padStart(2, '0')}`,
      monthLabel: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      totalCredit: Math.round(totalCredit * 100) / 100,
      totalRecovery: Math.round(totalRecovery * 100) / 100,
      netChange: Math.round(netChange * 100) / 100,
      shopCount,
      activeOrderbookers,
      dailyBreakdown,
      topRecoveryShops,
      topCreditShops,
      orderbookerBreakdown,
    });
  } catch (error) {
    console.error('Error generating monthly summary:', error);
    return NextResponse.json({ error: 'Failed to generate monthly summary' }, { status: 500 });
  }
}
