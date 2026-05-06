import { NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// GET /api/reports/daily-trends
// Returns last 7 days: [{ date, credit, recovery, net }]
export async function GET() {
  let client;
  try {
    const today = new Date();
    const days: { date: string; label: string; credit: number; recovery: number; net: number }[] = [];

    client = getPgClient();
    await client.connect();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const startOfDay = new Date(d);
      const endOfDay = new Date(d);
      endOfDay.setHours(23, 59, 59, 999);

      const dateStr = startOfDay.toISOString().split('T')[0];

      const txnRes = await client.query(
        `SELECT type, amount FROM "Transaction" WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND status = 'approved'`,
        [startOfDay.toISOString(), endOfDay.toISOString()]
      );
      const transactions: any[] = txnRes.rows;

      const credit = transactions
        .filter((t: any) => t.type === 'credit')
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const recovery = transactions
        .filter((t: any) => t.type === 'recovery')
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      const label = d.toLocaleDateString('en-PK', {
        weekday: 'short',
        day: 'numeric',
      });

      days.push({
        date: dateStr,
        label,
        credit: Math.round(credit * 100) / 100,
        recovery: Math.round(recovery * 100) / 100,
        net: Math.round((credit - recovery) * 100) / 100,
      });
    }

    await client.end();
    return NextResponse.json(days);
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error generating daily trends:', error);
    return NextResponse.json({ error: 'Failed to generate daily trends' }, { status: 500 });
  }
}
