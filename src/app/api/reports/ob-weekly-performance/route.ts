import { NextRequest, NextResponse } from 'next/server';
import { getLocalDateString } from '@/lib/utils';
import { getPool } from '@/lib/pg';

// GET /api/reports/ob-weekly-performance?orderbookerId=xxx&weeks=4
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const weeks = parseInt(searchParams.get('weeks') || '4', 10);

    if (!orderbookerId) {
      return NextResponse.json(
        { error: 'orderbookerId is required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Fetch orderbooker info
    const obRes = await pool.query(
      `SELECT id, name FROM "User" WHERE id = $1`,
      [orderbookerId]
    );

    if (obRes.rows.length === 0) {
      return NextResponse.json(
        { error: 'Orderbooker not found' },
        { status: 404 }
      );
    }

    const orderbooker = obRes.rows[0];

    // Calculate week boundaries (Saturday to Friday)
    const today = new Date();

    function getWeekBounds(refDate: Date): { start: Date; end: Date } {
      const day = refDate.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
      // Days since most recent Saturday: Sat=0, Sun=1, Mon=2, ..., Fri=6
      const daysSinceSaturday = (day - 6 + 7) % 7;

      const saturday = new Date(refDate);
      saturday.setDate(saturday.getDate() - daysSinceSaturday);
      saturday.setHours(0, 0, 0, 0);

      const friday = new Date(saturday);
      friday.setDate(friday.getDate() + 6);
      friday.setHours(23, 59, 59, 999);

      return { start: saturday, end: friday };
    }

    // Get current week bounds
    const currentWeek = getWeekBounds(today);

    // Generate all week ranges going backwards
    const weekRanges: { start: Date; end: Date }[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date(currentWeek.start);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      weekRanges.push({ start: weekStart, end: weekEnd });
    }

    // Fetch ALL recovery transactions for this orderbooker's shops across all weeks
    // FIX: Include admin-posted recoveries by filtering on shop's orderbookerId instead of createdBy
    const overallStart = weekRanges[0].start;
    const overallEnd = weekRanges[weekRanges.length - 1].end;

    const txnRes = await pool.query(
      `SELECT t.amount, t."createdAt", t."shopId" FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       WHERE t.type = 'recovery' AND t.status = 'approved' AND s."orderbookerId" = $1 AND t."createdAt" >= $2 AND t."createdAt" <= $3
       ORDER BY t."createdAt" ASC`,
      [orderbookerId, overallStart.toISOString(), overallEnd.toISOString()]
    );
    const transactions: any[] = txnRes.rows;

    // Group transactions by week and by day
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    function formatDateShort(date: Date): string {
      return `${monthNames[date.getMonth()]} ${date.getDate()}`;
    }

    // Helper: get date string in YYYY-MM-DD using Asia/Karachi timezone
    function toLocalDateStr(date: Date): string {
      return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    }

    const weeklyData = weekRanges.map((week, index) => {
      const weekTxns = transactions.filter(
        (t: any) => new Date(t.createdAt) >= week.start && new Date(t.createdAt) <= week.end
      );

      const total = weekTxns.reduce((s: number, t: any) => s + Number(t.amount), 0);

      // Count unique working days with at least one recovery
      const daySet = new Set(weekTxns.map((t: any) => toLocalDateStr(new Date(t.createdAt))));
      const days = daySet.size;

      const avg = days > 0 ? Math.round(total / days) : 0;

      // Count unique shops visited
      const shopSet = new Set(weekTxns.map((t: any) => t.shopId));
      const shopsVisited = shopSet.size;

      // Week label: "Week N (Mar 15-21)"
      const weekLabel = `Week ${index + 1} (${formatDateShort(week.start)}-${formatDateShort(week.end)})`;

      return {
        weekLabel,
        startDate: toLocalDateStr(week.start),
        endDate: toLocalDateStr(week.end),
        total: Math.round(total),
        days,
        avg,
        shopsVisited,
      };
    });

    // Calculate overall stats
    const totalRecovered = transactions.reduce((s: number, t: any) => s + Number(t.amount), 0);

    // Count total working days across all weeks
    const allDaysSet = new Set(transactions.map((t: any) => toLocalDateStr(new Date(t.createdAt))));
    const totalDays = allDaysSet.size;
    const avgDaily = totalDays > 0 ? Math.round(totalRecovered / totalDays) : 0;

    // Find best day
    const dayTotals: Record<string, number> = {};
    transactions.forEach((t: any) => {
      const dateStr = toLocalDateStr(new Date(t.createdAt));
      dayTotals[dateStr] = (dayTotals[dateStr] || 0) + Number(t.amount);
    });

    let bestDayDate = '';
    let bestDayAmount = 0;
    for (const [dateStr, amount] of Object.entries(dayTotals)) {
      if (amount > bestDayAmount) {
        bestDayAmount = amount;
        bestDayDate = dateStr;
      }
    }

    return NextResponse.json({
      orderbookerName: orderbooker.name,
      totalRecovered: Math.round(totalRecovered),
      totalDays,
      avgDaily,
      bestDay: bestDayDate
        ? { date: bestDayDate, amount: Math.round(bestDayAmount) }
        : null,
      weeklyData,
    });
  } catch (error) {
    console.error('Error generating weekly performance:', error);
    return NextResponse.json(
      { error: 'Failed to generate weekly performance report' },
      { status: 500 }
    );
  }
}
