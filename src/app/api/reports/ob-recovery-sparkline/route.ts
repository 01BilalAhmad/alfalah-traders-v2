import { NextRequest, NextResponse } from 'next/server';
import { getLocalDateString, getLocalStartOfDay, getLocalEndOfDay } from '@/lib/utils';
import { getPool } from '@/lib/pg';

// GET /api/reports/ob-recovery-sparkline?days=7
// Returns per-orderbooker recovery trend data for the last N days
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10), 1), 30);

    const pool = getPool();

    // Query all active orderbookers
    const obRes = await pool.query(
      `SELECT id, name FROM "User" WHERE role = 'orderbooker' AND status = 'active' ORDER BY name ASC`
    );
    const orderbookers: any[] = obRes.rows;

    // Generate date strings for the last N days
    const dateStrings: string[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dateStrings.push(getLocalDateString(d));
    }

    // For each orderbooker, fetch daily recovery totals
    const results = await Promise.all(
      orderbookers.map(async (ob: any) => {
        // Get shop IDs for this orderbooker (active only)
        const shopRes = await pool.query(
          `SELECT id FROM "Shop" WHERE "orderbookerId" = $1 AND status = 'active'`,
          [ob.id]
        );
        const shopIds = shopRes.rows.map((s: any) => s.id);

        if (shopIds.length === 0) {
          return {
            orderbookerId: ob.id,
            orderbookerName: ob.name,
            data: new Array(days).fill(0),
            total: 0,
            avg: 0,
            trend: 'stable' as string,
          };
        }

        // For each day, sum recovery transactions
        const dailyData = await Promise.all(
          dateStrings.map(async (dateStr) => {
            const startOfDay = getLocalStartOfDay(dateStr);
            const endOfDay = getLocalEndOfDay(dateStr);

            // Build placeholder string for IN clause
            const placeholders = shopIds.map((_, idx: number) => `$${idx + 3}`).join(', ');
            const sumRes = await pool.query(
              `SELECT COALESCE(SUM(amount), 0) AS total FROM "Transaction"
               WHERE "shopId" IN (${placeholders}) AND type = 'recovery' AND status = 'approved' AND "createdAt" >= $1 AND "createdAt" <= $2`,
              [startOfDay.toISOString(), endOfDay.toISOString(), ...shopIds]
            );

            return Math.round(Number(sumRes.rows[0].total));
          })
        );

        const total = dailyData.reduce((s: number, v: number) => s + v, 0);
        const nonZeroDays = dailyData.filter((v: number) => v > 0).length;
        const avg = nonZeroDays > 0 ? Math.round(total / nonZeroDays) : 0;

        // Determine trend: compare last 3 days avg vs first 3 days avg
        let trend = 'stable' as string;
        if (dailyData.length >= 4) {
          const firstHalf = dailyData.slice(0, Math.floor(dailyData.length / 2));
          const secondHalf = dailyData.slice(Math.floor(dailyData.length / 2));
          const firstAvg = firstHalf.reduce((s: number, v: number) => s + v, 0) / firstHalf.length;
          const secondAvg = secondHalf.reduce((s: number, v: number) => s + v, 0) / secondHalf.length;
          const diff = secondAvg - firstAvg;
          // Use 5% threshold relative to max value to avoid noise
          const threshold = Math.max(Math.max(...dailyData) * 0.05, 100);
          if (diff > threshold) trend = 'up';
          else if (diff < -threshold) trend = 'down';
        } else {
          // For very short data, just compare last vs first
          const last = dailyData[dailyData.length - 1] || 0;
          const first = dailyData[0] || 0;
          if (last > first + 100) trend = 'up';
          else if (last < first - 100) trend = 'down';
        }

        return {
          orderbookerId: ob.id,
          orderbookerName: ob.name,
          data: dailyData,
          total,
          avg,
          trend,
        };
      })
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error generating OB recovery sparkline data:', error);
    return NextResponse.json({ error: 'Failed to generate sparkline data' }, { status: 500 });
  }
}
