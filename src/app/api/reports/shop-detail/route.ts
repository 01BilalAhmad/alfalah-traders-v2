import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/reports/shop-detail?shopId=xxx
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
          select: { id: true, name: true },
        },
      },
    });

    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Fetch all transactions for this shop
    const transactions = await db.transaction.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: { id: true, name: true, role: true },
        },
      },
    });

    // Compute stats
    const creditTxns = transactions.filter((t) => t.type === 'credit');
    const recoveryTxns = transactions.filter((t) => t.type === 'recovery');

    const totalCredit = creditTxns.reduce((s, t) => s + t.amount, 0);
    const totalRecovery = recoveryTxns.reduce((s, t) => s + t.amount, 0);
    const netBalance = shop.balance;

    const avgCreditPerTransaction = creditTxns.length > 0 ? totalCredit / creditTxns.length : 0;
    const avgRecoveryPerTransaction = recoveryTxns.length > 0 ? totalRecovery / recoveryTxns.length : 0;

    const lastTransaction = transactions.length > 0 ? transactions[0] : null;
    const lastTransactionDate = lastTransaction ? lastTransaction.createdAt.toISOString().split('T')[0] : null;

    const now = new Date();
    let daysSinceLastTransaction = 999;
    if (lastTransactionDate) {
      const lastDate = new Date(lastTransactionDate);
      daysSinceLastTransaction = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    const creditLimitUsage = shop.creditLimit > 0 ? shop.balance / shop.creditLimit : 0;
    const recoveryRate = totalCredit > 0 ? (totalRecovery / totalCredit) * 100 : 0;

    // Monthly trend — last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const recentTransactions = transactions.filter((t) => t.createdAt >= sixMonthsAgo);

    const monthlyMap: Record<string, { credit: number; recovery: number }> = {};
    recentTransactions.forEach((t) => {
      const month = t.createdAt.toISOString().slice(0, 7); // "2026-01"
      if (!monthlyMap[month]) monthlyMap[month] = { credit: 0, recovery: 0 };
      if (t.type === 'credit') monthlyMap[month].credit += t.amount;
      else monthlyMap[month].recovery += t.amount;
    });

    // Fill in missing months for last 6 months
    const monthlyTrend: { month: string; credit: number; recovery: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const data = monthlyMap[key] || { credit: 0, recovery: 0 };
      monthlyTrend.push({
        month: key,
        credit: Math.round(data.credit),
        recovery: Math.round(data.recovery),
      });
    }

    // Top credit days — find which day of week has most credit transactions
    const dayCreditMap: Record<string, number> = {};
    creditTxns.forEach((t) => {
      const day = t.createdAt.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      dayCreditMap[day] = (dayCreditMap[day] || 0) + t.amount;
    });
    const sortedDays = Object.entries(dayCreditMap).sort((a, b) => b[1] - a[1]);
    const topCreditDays = sortedDays.slice(0, 2).map((d) => d[0]);

    // Recent transactions (last 20)
    const recentTwenty = transactions.slice(0, 20).map((t) => ({
      id: t.id,
      type: t.type,
      amount: Math.round(t.amount * 100) / 100,
      previousBalance: Math.round(t.previousBalance * 100) / 100,
      newBalance: Math.round(t.newBalance * 100) / 100,
      description: t.description,
      createdBy: t.creator.name,
      createdAt: t.createdAt.toISOString(),
    }));

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
        creditLimit: shop.creditLimit,
        status: shop.status,
        orderbookerName: shop.orderbooker.name,
        createdAt: shop.createdAt.toISOString(),
      },
      stats: {
        totalCredit: Math.round(totalCredit),
        totalRecovery: Math.round(totalRecovery),
        netBalance: Math.round(netBalance),
        avgCreditPerTransaction: Math.round(avgCreditPerTransaction),
        avgRecoveryPerTransaction: Math.round(avgRecoveryPerTransaction),
        transactionCount: transactions.length,
        lastTransactionDate,
        daysSinceLastTransaction,
        creditLimitUsage: Math.round(creditLimitUsage * 100) / 100,
      },
      monthlyTrend,
      recentTransactions: recentTwenty,
      topCreditDays,
      recoveryRate: Math.round(recoveryRate * 10) / 10,
    });
  } catch (error) {
    console.error('Error fetching shop detail analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch shop detail analytics' }, { status: 500 });
  }
}
