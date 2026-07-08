import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/shop-detail?shopId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get('shopId');

    if (!shopId) {
      return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
    }

    const pool = getPool();

    // Fetch shop with orderbooker
    const shopRes = await pool.query(
      `SELECT s.*, u.id AS "ob_id", u.name AS "ob_name"
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       WHERE s.id = $1`,
      [shopId]
    );

    if (shopRes.rows.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const shop = shopRes.rows[0];

    // Fetch all transactions for this shop with creator info
    const txnRes = await pool.query(
      `SELECT t.*, u.id AS "creator_id", u.name AS "creator_name", u.role AS "creator_role"
       FROM "Transaction" t
       LEFT JOIN "User" u ON t."createdBy" = u.id
       WHERE t."shopId" = $1 AND t.status = 'approved'
       ORDER BY t."createdAt" DESC`,
      [shopId]
    );
    const transactions: any[] = txnRes.rows;

    // Compute stats
    const creditTxns = transactions.filter((t: any) => t.type === 'credit');
    const recoveryTxns = transactions.filter((t: any) => t.type === 'recovery');
    const claimTxns = transactions.filter((t: any) => t.type === 'claim');

    const totalCredit = creditTxns.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalRecovery = recoveryTxns.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalClaims = claimTxns.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const netBalance = Number(shop.balance);

    const avgCreditPerTransaction = creditTxns.length > 0 ? totalCredit / creditTxns.length : 0;
    const avgRecoveryPerTransaction = recoveryTxns.length > 0 ? totalRecovery / recoveryTxns.length : 0;

    const lastTransaction = transactions.length > 0 ? transactions[0] : null;
    const lastTransactionDate = lastTransaction ? new Date(lastTransaction.createdAt).toISOString().split('T')[0] : null;

    const now = new Date();
    let daysSinceLastTransaction = 999;
    if (lastTransactionDate) {
      const lastDate = new Date(lastTransactionDate);
      daysSinceLastTransaction = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    const creditLimitUsage = Number(shop.creditLimit) > 0 ? Number(shop.balance) / Number(shop.creditLimit) : 0;
    const recoveryRate = totalCredit > 0 ? (totalRecovery / totalCredit) * 100 : 0;

    // Monthly trend — last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const recentTransactions = transactions.filter((t: any) => new Date(t.createdAt) >= sixMonthsAgo);

    const monthlyMap: Record<string, { credit: number; recovery: number }> = {};
    recentTransactions.forEach((t: any) => {
      const month = new Date(t.createdAt).toISOString().slice(0, 7); // "2026-01"
      if (!monthlyMap[month]) monthlyMap[month] = { credit: 0, recovery: 0 };
      if (t.type === 'credit') monthlyMap[month].credit += Number(t.amount);
      else monthlyMap[month].recovery += Number(t.amount);
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
    creditTxns.forEach((t: any) => {
      const day = new Date(t.createdAt).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      dayCreditMap[day] = (dayCreditMap[day] || 0) + Number(t.amount);
    });
    const sortedDays = Object.entries(dayCreditMap).sort((a, b) => b[1] - a[1]);
    const topCreditDays = sortedDays.slice(0, 2).map((d) => d[0]);

    // Recent transactions (last 20)
    const recentTwenty = transactions.slice(0, 20).map((t: any) => ({
      id: t.id,
      type: t.type,
      amount: Math.round(Number(t.amount) * 100) / 100,
      previousBalance: Math.round(Number(t.previousBalance) * 100) / 100,
      newBalance: Math.round(Number(t.newBalance) * 100) / 100,
      description: t.description,
      createdBy: t.creator_name,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    }));

    return NextResponse.json({
      shop: {
        id: shop.id,
        name: shop.name,
        ownerName: shop.ownerName,
        area: shop.area,
        address: shop.address,
        phone: shop.phone,
        routeDays: shop.routeDays || [],
        balance: Number(shop.balance),
        creditLimit: Number(shop.creditLimit),
        status: shop.status,
        orderbookerName: shop.ob_name,
        createdAt: shop.createdAt instanceof Date ? shop.createdAt.toISOString() : shop.createdAt,
      },
      stats: {
        totalCredit: Math.round(totalCredit),
        totalRecovery: Math.round(totalRecovery),
        totalClaims: Math.round(totalClaims),
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
