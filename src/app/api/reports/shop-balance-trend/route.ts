import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getLocalDateString, getLocalStartOfDay, getLocalEndOfDay } from '@/lib/utils';

// GET /api/reports/shop-balance-trend?shopId=xxx&days=30
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get('shopId');
    const days = parseInt(searchParams.get('days') || '30', 10);

    if (!shopId) {
      return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
    }

    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json({ error: 'Days must be between 1 and 365' }, { status: 400 });
    }

    // Fetch shop info
    const shop = await db.shop.findUnique({
      where: { id: shopId },
      select: { id: true, name: true, balance: true },
    });

    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const today = getLocalDateString();
    const todayStart = getLocalStartOfDay(today);
    const startDate = new Date(todayStart);
    startDate.setDate(startDate.getDate() - days);
    // End of today for inclusive range
    const endDate = new Date(todayStart);
    endDate.setHours(23, 59, 59, 999);

    // Fetch all transactions for this shop before the range to calculate starting balance
    // Balance = sum of credits - sum of recoveries
    const transactionsBeforeRange = await db.transaction.findMany({
      where: {
        shopId,
        createdAt: { lt: startDate },
      },
      select: { type: true, amount: true },
      orderBy: { createdAt: 'asc' },
    });

    // Starting balance = net of all transactions before the date range
    const startBalance = transactionsBeforeRange.reduce((sum, t) => {
      if (t.type === 'credit') return sum + t.amount;
      if (t.type === 'recovery') return sum - t.amount;
      return sum;
    }, 0);

    // Fetch all transactions within the range, ordered by date
    const transactionsInRange = await db.transaction.findMany({
      where: {
        shopId,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { type: true, amount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group transactions by date
    const dailyTxnMap: Record<string, { credits: number; recoveries: number }> = {};
    transactionsInRange.forEach((t) => {
      const dateStr = getLocalDateString(t.createdAt);
      if (!dailyTxnMap[dateStr]) dailyTxnMap[dateStr] = { credits: 0, recoveries: 0 };
      if (t.type === 'credit') dailyTxnMap[dateStr].credits += t.amount;
      else dailyTxnMap[dateStr].recoveries += t.amount;
    });

    // Build daily balance data
    const data: { date: string; balance: number }[] = [];
    let runningBalance = startBalance;

    for (let i = 0; i <= days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

      const dayTxns = dailyTxnMap[dateStr];
      if (dayTxns) {
        runningBalance += dayTxns.credits - dayTxns.recoveries;
      }

      data.push({
        date: dateStr,
        balance: Math.round(runningBalance * 100) / 100,
      });
    }

    const currentBalance = data[data.length - 1].balance;
    const startBalanceRounded = Math.round(startBalance * 100) / 100;
    const change = Math.round((currentBalance - startBalanceRounded) * 100) / 100;
    const changePercent = startBalanceRounded !== 0
      ? Math.round((change / Math.abs(startBalanceRounded)) * 1000) / 10
      : (change !== 0 ? 100 : 0);

    return NextResponse.json({
      shopId: shop.id,
      shopName: shop.name,
      currentBalance,
      startBalance: startBalanceRounded,
      change,
      changePercent,
      data,
    });
  } catch (error) {
    console.error('Error fetching shop balance trend:', error);
    return NextResponse.json({ error: 'Failed to fetch balance trend' }, { status: 500 });
  }
}
