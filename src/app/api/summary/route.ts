import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

export async function GET() {
  try {
    const pool = getPool();

    const [
      totalUsersRes,
      totalShopsRes,
      totalTransactionsRes,
      creditAggRes,
      recoveryAggRes,
      netBalanceAggRes,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM "User"'),
      pool.query('SELECT COUNT(*) FROM "Shop"'),
      pool.query('SELECT COUNT(*) FROM "Transaction"'),
      pool.query('SELECT COALESCE(SUM(amount), 0) AS total FROM "Transaction" WHERE type = \'credit\' AND status = \'approved\''),
      pool.query('SELECT COALESCE(SUM(amount), 0) AS total FROM "Transaction" WHERE type = \'recovery\' AND status = \'approved\''),
      pool.query('SELECT COALESCE(SUM(balance), 0) AS total FROM "Shop"'),
    ]);

    const totalUsers = parseInt(totalUsersRes.rows[0].count, 10);
    const totalShops = parseInt(totalShopsRes.rows[0].count, 10);
    const totalTransactions = parseInt(totalTransactionsRes.rows[0].count, 10);
    const totalCredit = Number(creditAggRes.rows[0].total);
    const totalRecovery = Number(recoveryAggRes.rows[0].total);
    const netBalance = Number(netBalanceAggRes.rows[0].total);

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
