import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const [
      totalUsers,
      totalShops,
      totalTransactions,
      creditAgg,
      recoveryAgg,
      netBalanceAgg,
    ] = await Promise.all([
      db.user.count(),
      db.shop.count(),
      db.transaction.count(),
      db.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'credit' },
      }),
      db.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'recovery' },
      }),
      db.shop.aggregate({
        _sum: { balance: true },
      }),
    ]);

    const totalCredit = creditAgg._sum.amount ?? 0;
    const totalRecovery = recoveryAgg._sum.amount ?? 0;
    const netBalance = netBalanceAgg._sum.balance ?? 0;

    return NextResponse.json({
      totalUsers,
      totalShops,
      totalTransactions,
      totalCredit,
      totalRecovery,
      netBalance,
    });
  } catch (error) {
    console.error('Summary API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    );
  }
}
