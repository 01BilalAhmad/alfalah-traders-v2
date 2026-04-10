import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/reports/daily-trends
// Returns last 7 days: [{ date, credit, recovery, net }]
export async function GET() {
  try {
    const today = new Date();
    const days: { date: string; label: string; credit: number; recovery: number; net: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const startOfDay = new Date(d);
      const endOfDay = new Date(d);
      endOfDay.setHours(23, 59, 59, 999);

      const dateStr = startOfDay.toISOString().split('T')[0];

      const transactions = await db.transaction.findMany({
        where: {
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
        select: { type: true, amount: true },
      });

      const credit = transactions
        .filter((t) => t.type === 'credit')
        .reduce((sum, t) => sum + t.amount, 0);
      const recovery = transactions
        .filter((t) => t.type === 'recovery')
        .reduce((sum, t) => sum + t.amount, 0);

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

    return NextResponse.json(days);
  } catch (error) {
    console.error('Error generating daily trends:', error);
    return NextResponse.json({ error: 'Failed to generate daily trends' }, { status: 500 });
  }
}
