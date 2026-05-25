import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/daily-breakdown?userId=xxx&days=28
// Returns pre-aggregated daily credit/recovery totals for chart (solves 70-request problem)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const days = parseInt(searchParams.get('days') || '28');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const pool = getPool();

    // Calculate date range in Pakistan timezone
    const pkOffset = 5 * 60; // UTC+5
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Single query to get all daily totals
    const breakdownRes = await pool.query(
      `SELECT
         DATE(t."createdAt") AS date,
         t.type,
         SUM(t.amount) AS total,
         COUNT(t.id) AS count
       FROM "Transaction" t
       WHERE t."createdBy" = $1
         AND t.status = 'approved'
         AND t."createdAt" >= $2
       GROUP BY DATE(t."createdAt"), t.type
       ORDER BY date ASC`,
      [userId, startDate.toISOString()]
    );

    // Build day-by-day breakdown
    const breakdown: { date: string; credit: number; recovery: number; creditCount: number; recoveryCount: number }[] = [];

    // Initialize all days with zeros
    for (let i = 0; i <= days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      breakdown.push({
        date: dateStr,
        credit: 0,
        recovery: 0,
        creditCount: 0,
        recoveryCount: 0,
      });
    }

    // Fill in actual data
    for (const row of breakdownRes.rows) {
      const dateVal = row.date;
      const dateStr = dateVal instanceof Date
        ? `${dateVal.getFullYear()}-${String(dateVal.getMonth() + 1).padStart(2, '0')}-${String(dateVal.getDate()).padStart(2, '0')}`
        : String(dateVal).split('T')[0];

      const entry = breakdown.find((e) => e.date === dateStr);
      if (entry) {
        const total = Number(row.total);
        const count = parseInt(row.count, 10);
        if (row.type === 'credit') {
          entry.credit = Math.round(total * 100) / 100;
          entry.creditCount = count;
        } else if (row.type === 'recovery') {
          entry.recovery = Math.round(total * 100) / 100;
          entry.recoveryCount = count;
        }
      }
    }

    // Compute totals
    const totalCredit = breakdown.reduce((s, d) => s + d.credit, 0);
    const totalRecovery = breakdown.reduce((s, d) => s + d.recovery, 0);

    return NextResponse.json({
      days,
      totalCredit: Math.round(totalCredit * 100) / 100,
      totalRecovery: Math.round(totalRecovery * 100) / 100,
      breakdown,
    });
  } catch (error) {
    console.error('Error generating daily breakdown:', error);
    return NextResponse.json({ error: 'Failed to generate daily breakdown' }, { status: 500 });
  }
}
