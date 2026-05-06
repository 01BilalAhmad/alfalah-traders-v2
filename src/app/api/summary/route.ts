import { NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

export async function GET() {
  let client;
  try {
    client = getPgClient();
    await client.connect();

    const [
      totalUsersRes,
      totalShopsRes,
      totalTransactionsRes,
      creditAggRes,
      recoveryAggRes,
      netBalanceAggRes,
    ] = await Promise.all([
      client.query('SELECT COUNT(*) FROM "User"'),
      client.query('SELECT COUNT(*) FROM "Shop"'),
      client.query('SELECT COUNT(*) FROM "Transaction"'),
      client.query('SELECT COALESCE(SUM(amount), 0) AS total FROM "Transaction" WHERE type = \'credit\' AND status = \'approved\''),
      client.query('SELECT COALESCE(SUM(amount), 0) AS total FROM "Transaction" WHERE type = \'recovery\' AND status = \'approved\''),
      client.query('SELECT COALESCE(SUM(balance), 0) AS total FROM "Shop"'),
    ]);

    const totalUsers = parseInt(totalUsersRes.rows[0].count, 10);
    const totalShops = parseInt(totalShopsRes.rows[0].count, 10);
    const totalTransactions = parseInt(totalTransactionsRes.rows[0].count, 10);
    const totalCredit = Number(creditAggRes.rows[0].total);
    const totalRecovery = Number(recoveryAggRes.rows[0].total);
    const netBalance = Number(netBalanceAggRes.rows[0].total);

    await client.end();
    return NextResponse.json({
      totalUsers,
      totalShops,
      totalTransactions,
      totalCredit,
      totalRecovery,
      netBalance,
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Summary API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    );
  }
}
