import { NextRequest, NextResponse } from 'next/server';
import { getLocalDateString, getLocalStartOfDay, getLocalEndOfDay } from '@/lib/utils';
import { getPool } from '@/lib/pg';

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

    const pool = getPool();

    // Fetch shop info
    const shopRes = await pool.query(
      `SELECT id, name, balance FROM "Shop" WHERE id = $1`,
      [shopId]
    );

    if (shopRes.rows.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const shop = shopRes.rows[0];

    const today = getLocalDateString();
    const todayStart = getLocalStartOfDay(today);
    const startDate = new Date(todayStart);
    startDate.setDate(startDate.getDate() - days);
    // End of today for inclusive range
    const endDate = new Date(todayStart);
    endDate.setHours(23, 59, 59, 999);

    // Fetch all transactions for this shop before the range to calculate starting balance
    const beforeRes = await pool.query(
      `SELECT type, amount FROM "Transaction" WHERE "shopId" = $1 AND "createdAt" < $2 AND status = 'approved' ORDER BY "createdAt" ASC`,
      [shopId, startDate.toISOString()]
    );
    const transactionsBeforeRange: any[] = beforeRes.rows;

    // Starting balance = net of all transactions before the date range
    const startBalance = transactionsBeforeRange.reduce((sum: number, t: any) => {
      if (t.type === 'credit') return sum + Number(t.amount);
      if (t.type === 'recovery') return sum - Number(t.amount);
      return sum;
    }, 0);

    // Fetch all transactions within the range, ordered by date
    const rangeRes = await pool.query(
      `SELECT type, amount, "createdAt" FROM "Transaction" WHERE "shopId" = $1 AND "createdAt" >= $2 AND "createdAt" <= $3 AND status = 'approved' ORDER BY "createdAt" ASC`,
      [shopId, startDate.toISOString(), endDate.toISOString()]
    );
    const transactionsInRange: any[] = rangeRes.rows;

    // Group transactions by date
    const dailyTxnMap: Record<string, { credits: number; recoveries: number }> = {};
    transactionsInRange.forEach((t: any) => {
      const dateStr = getLocalDateString(new Date(t.createdAt));
      if (!dailyTxnMap[dateStr]) dailyTxnMap[dateStr] = { credits: 0, recoveries: 0 };
      if (t.type === 'credit') dailyTxnMap[dateStr].credits += Number(t.amount);
      else dailyTxnMap[dateStr].recoveries += Number(t.amount);
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
