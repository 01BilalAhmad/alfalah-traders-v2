import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/month-summary?month=2025-01
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('month');

    // Parse month (YYYY-MM) or default to current month
    // (current month in PAKISTAN timezone, not the server's local timezone)
    const now = new Date();
    let year: number;
    let month: number;

    if (monthParam) {
      const parts = monthParam.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
    } else {
      const pktNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
      year = pktNow.getUTCFullYear();
      month = pktNow.getUTCMonth() + 1;
    }

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
    }

    // Calculate month boundaries in PAKISTAN timezone (PKT = UTC+5, no DST).
    // Previously used server-local Date(y, m-1, 1) — on a UTC server (Vercel)
    // every month started at 05:00 PKT, leaking PKT 00:00–04:59 entries of
    // the 1st into the previous month's report.
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const startDate = new Date(Date.UTC(year, month - 1, 1, -5, 0, 0, 0)); // PKT 1st 00:00
    const endDate = new Date(Date.UTC(year, month - 1, lastDay, 18, 59, 59, 999)); // PKT last day 23:59:59.999

    const pool = getPool();

    // Fetch all transactions in the month.
    // `supplier_collection` counts as recovery so this report matches the
    // dashboard/OB totals; claims and balance_adjustment corrections are
    // excluded (not credit or recovery).
    const monthTxnRes = await pool.query(
      `SELECT type, amount, "createdAt" FROM "Transaction" WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND status = 'approved' AND type IN ('credit', 'recovery', 'supplier_collection') ORDER BY "createdAt" DESC`,
      [startDate.toISOString(), endDate.toISOString()]
    );
    const monthTransactions: any[] = monthTxnRes.rows;

    // Calculate totals (recovery = recovery + supplier_collection)
    const totalCredit = monthTransactions
      .filter((t: any) => t.type === 'credit')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const totalRecovery = monthTransactions
      .filter((t: any) => t.type === 'recovery' || t.type === 'supplier_collection')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const netPosition = totalRecovery - totalCredit;
    const transactionCount = monthTransactions.length;

    // Find top recovery day (PKT calendar day, not UTC day)
    const recoveryByDay: Record<string, number> = {};
    monthTransactions
      .filter((t: any) => t.type === 'recovery' || t.type === 'supplier_collection')
      .forEach((t: any) => {
        const pktDay = new Date(new Date(t.createdAt).getTime() + 5 * 60 * 60 * 1000);
        const dayKey = `${pktDay.getUTCFullYear()}-${String(pktDay.getUTCMonth() + 1).padStart(2, '0')}-${String(pktDay.getUTCDate()).padStart(2, '0')}`;
        recoveryByDay[dayKey] = (recoveryByDay[dayKey] || 0) + Number(t.amount);
      });

    let topRecoveryDay: { date: string; amount: number } | null = null;
    Object.entries(recoveryByDay).forEach(([date, amount]) => {
      if (!topRecoveryDay || amount > topRecoveryDay.amount) {
        topRecoveryDay = { date, amount };
      }
    });

    // Find top credit day (PKT calendar day, not UTC day)
    const creditByDay: Record<string, number> = {};
    monthTransactions
      .filter((t: any) => t.type === 'credit')
      .forEach((t: any) => {
        const pktDay = new Date(new Date(t.createdAt).getTime() + 5 * 60 * 60 * 1000);
        const dayKey = `${pktDay.getUTCFullYear()}-${String(pktDay.getUTCMonth() + 1).padStart(2, '0')}-${String(pktDay.getUTCDate()).padStart(2, '0')}`;
        creditByDay[dayKey] = (creditByDay[dayKey] || 0) + Number(t.amount);
      });

    let topCreditDay: { date: string; amount: number } | null = null;
    Object.entries(creditByDay).forEach(([date, amount]) => {
      if (!topCreditDay || amount > topCreditDay.amount) {
        topCreditDay = { date, amount };
      }
    });

    // Fetch previous month for comparison (PKT boundaries)
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) { prevMonth = 12; prevYear -= 1; }
    const prevLastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
    const prevStartDate = new Date(Date.UTC(prevYear, prevMonth - 1, 1, -5, 0, 0, 0));
    const prevEndDate = new Date(Date.UTC(prevYear, prevMonth - 1, prevLastDay, 18, 59, 59, 999));

    const prevTxnRes = await pool.query(
      `SELECT type, amount FROM "Transaction" WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND status = 'approved' AND type IN ('credit', 'recovery', 'supplier_collection')`,
      [prevStartDate.toISOString(), prevEndDate.toISOString()]
    );
    const prevTransactions: any[] = prevTxnRes.rows;

    const prevTotalCredit = prevTransactions
      .filter((t: any) => t.type === 'credit')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const prevTotalRecovery = prevTransactions
      .filter((t: any) => t.type === 'recovery' || t.type === 'supplier_collection')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const prevNetPosition = prevTotalRecovery - prevTotalCredit;

    // Calculate percentage changes
    function pctChange(current: number, previous: number): number {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    }

    return NextResponse.json({
      month: `${year}-${String(month).padStart(2, '0')}`,
      monthLabel: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      totalCredit: Math.round(totalCredit * 100) / 100,
      totalRecovery: Math.round(totalRecovery * 100) / 100,
      netPosition: Math.round(netPosition * 100) / 100,
      transactionCount,
      creditCount: monthTransactions.filter((t: any) => t.type === 'credit').length,
      recoveryCount: monthTransactions.filter((t: any) => t.type === 'recovery' || t.type === 'supplier_collection').length,
      topRecoveryDay: topRecoveryDay ? {
        date: topRecoveryDay.date,
        amount: Math.round(topRecoveryDay.amount * 100) / 100,
      } : null,
      topCreditDay: topCreditDay ? {
        date: topCreditDay.date,
        amount: Math.round(topCreditDay.amount * 100) / 100,
      } : null,
      activeDays: Object.keys({ ...recoveryByDay, ...creditByDay }).length,
      // Previous month comparison
      prevMonth: `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
      prevTotalCredit: Math.round(prevTotalCredit * 100) / 100,
      prevTotalRecovery: Math.round(prevTotalRecovery * 100) / 100,
      prevNetPosition: Math.round(prevNetPosition * 100) / 100,
      creditChangePct: pctChange(totalCredit, prevTotalCredit),
      recoveryChangePct: pctChange(totalRecovery, prevTotalRecovery),
      netChangePct: pctChange(netPosition, prevNetPosition),
    });
  } catch (error) {
    console.error('Error generating month summary:', error);
    return NextResponse.json({ error: 'Failed to generate month summary' }, { status: 500 });
  }
}
