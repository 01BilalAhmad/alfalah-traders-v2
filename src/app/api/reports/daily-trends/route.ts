import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/daily-trends
// Returns last 7 days: [{ date, credit, recovery, net }]
// Single GROUP BY query instead of 7 separate queries (avoids N+1)
export async function GET() {
  try {
    const today = new Date();
    const pool = getPool();

    // Compute date range: last 7 days starting from 6 days ago at 00:00 local
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    // Single query: aggregate approved transactions by day + type
    const txnRes = await pool.query(
      `SELECT
         DATE("createdAt") AS day,
         type,
         COALESCE(SUM(amount), 0) AS total
       FROM "Transaction"
       WHERE "createdAt" >= $1
         AND "createdAt" <= $2
         AND status = 'approved'
       GROUP BY DATE("createdAt"), type`,
      [startDate.toISOString(), endDate.toISOString()]
    );

    // Build a lookup: { 'YYYY-MM-DD': { credit: X, recovery: Y } }
    const dayMap: Record<string, { credit: number; recovery: number }> = {};
    for (const row of txnRes.rows) {
      const dayIso: string = row.day instanceof Date
        ? row.day.toISOString().split('T')[0]
        : String(row.day).split('T')[0];
      if (!dayMap[dayIso]) dayMap[dayIso] = { credit: 0, recovery: 0 };
      if (row.type === 'credit') dayMap[dayIso].credit += Number(row.total);
      else if (row.type === 'recovery') dayMap[dayIso].recovery += Number(row.total);
    }

    // Build the 7-day response array (filling missing days with zeros)
    const days: { date: string; label: string; credit: number; recovery: number; net: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);

      const dateStr = d.toISOString().split('T')[0];
      const stats = dayMap[dateStr] || { credit: 0, recovery: 0 };

      const label = d.toLocaleDateString('en-PK', {
        weekday: 'short',
        day: 'numeric',
      });

      days.push({
        date: dateStr,
        label,
        credit: Math.round(stats.credit * 100) / 100,
        recovery: Math.round(stats.recovery * 100) / 100,
        net: Math.round((stats.credit - stats.recovery) * 100) / 100,
      });
    }

    return NextResponse.json(days);
  } catch (error) {
    console.error('Error generating daily trends:', error);
    return NextResponse.json({ error: 'Failed to generate daily trends' }, { status: 500 });
  }
}
