import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/users/:id/visit-streak - Get visit streak for an orderbooker
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderbookerId } = await params;

    const pool = getPool();

    // Calculate visit streak from actual visit records
    // A "visit day" is any day where the orderbooker has at least one ShopVisit
    // Use Pakistan timezone (UTC+5) for date calculation
    const visitsRes = await pool.query(
      `SELECT (DATE("createdAt" AT TIME ZONE 'Asia/Karachi')) AS visit_date
       FROM "ShopVisit"
       WHERE "orderbookerId" = $1
       GROUP BY (DATE("createdAt" AT TIME ZONE 'Asia/Karachi'))
       ORDER BY visit_date DESC
       LIMIT 365`,
      [orderbookerId]
    );

    const visitDates: string[] = visitsRes.rows.map((r: any) => {
      const d = r.visit_date;
      return d instanceof Date
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        : String(d);
    });

    // Also check recovery transactions as visits (for backward compat before ShopVisit table existed)
    const txVisitsRes = await pool.query(
      `SELECT (DATE("createdAt" AT TIME ZONE 'Asia/Karachi')) AS visit_date
       FROM "Transaction"
       WHERE "createdBy" = $1 AND type = 'recovery' AND status = 'approved'
       GROUP BY (DATE("createdAt" AT TIME ZONE 'Asia/Karachi'))
       ORDER BY visit_date DESC
       LIMIT 365`,
      [orderbookerId]
    );

    const txVisitDates: string[] = txVisitsRes.rows.map((r: any) => {
      const d = r.visit_date;
      return d instanceof Date
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        : String(d);
    });

    // Merge and deduplicate
    const allDates = [...new Set([...visitDates, ...txVisitDates])].sort().reverse();

    // Calculate current streak (consecutive days ending today or yesterday in Pakistan timezone)
    const today = new Date();
    const pkToday = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
    const todayStr = `${pkToday.getFullYear()}-${String(pkToday.getMonth() + 1).padStart(2, '0')}-${String(pkToday.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(pkToday);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    if (allDates.length > 0) {
      // Check if most recent visit is today or yesterday
      const latestVisit = allDates[0];
      if (latestVisit === todayStr || latestVisit === yesterdayStr) {
        // Count backwards from latest
        let checkDate = new Date(latestVisit);
        for (const dateStr of allDates) {
          const visitDate = new Date(dateStr);
          const diffDays = Math.round((checkDate.getTime() - visitDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays <= 1) {
            currentStreak++;
            checkDate = visitDate;
          } else {
            break;
          }
        }
      }

      // Calculate longest streak from all dates
      tempStreak = 1;
      for (let i = 1; i < allDates.length; i++) {
        const prev = new Date(allDates[i - 1]);
        const curr = new Date(allDates[i]);
        const diffDays = Math.round((prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak, currentStreak);
    }

    return NextResponse.json({
      orderbookerId,
      currentStreak,
      longestStreak,
      lastVisitDate: allDates[0] || null,
      totalVisitDays: allDates.length,
    });
  } catch (error) {
    console.error('Error fetching visit streak:', error);
    return NextResponse.json({ error: 'Failed to fetch visit streak' }, { status: 500 });
  }
}
