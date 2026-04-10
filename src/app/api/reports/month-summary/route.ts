import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/reports/month-summary?month=2025-01
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('month');

    // Parse month (YYYY-MM) or default to current month
    const now = new Date();
    let year: number;
    let month: number;

    if (monthParam) {
      const parts = monthParam.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
    } else {
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
    }

    // Calculate month boundaries
    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month

    // Fetch all transactions in the month
    const monthTransactions = await db.transaction.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        type: true,
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate totals
    const totalCredit = monthTransactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalRecovery = monthTransactions
      .filter((t) => t.type === 'recovery')
      .reduce((sum, t) => sum + t.amount, 0);

    const netPosition = totalRecovery - totalCredit;
    const transactionCount = monthTransactions.length;

    // Find top recovery day
    const recoveryByDay: Record<string, number> = {};
    monthTransactions
      .filter((t) => t.type === 'recovery')
      .forEach((t) => {
        const dayKey = t.createdAt.toISOString().split('T')[0];
        recoveryByDay[dayKey] = (recoveryByDay[dayKey] || 0) + t.amount;
      });

    let topRecoveryDay: { date: string; amount: number } | null = null;
    Object.entries(recoveryByDay).forEach(([date, amount]) => {
      if (!topRecoveryDay || amount > topRecoveryDay.amount) {
        topRecoveryDay = { date, amount };
      }
    });

    // Find top credit day
    const creditByDay: Record<string, number> = {};
    monthTransactions
      .filter((t) => t.type === 'credit')
      .forEach((t) => {
        const dayKey = t.createdAt.toISOString().split('T')[0];
        creditByDay[dayKey] = (creditByDay[dayKey] || 0) + t.amount;
      });

    let topCreditDay: { date: string; amount: number } | null = null;
    Object.entries(creditByDay).forEach(([date, amount]) => {
      if (!topCreditDay || amount > topCreditDay.amount) {
        topCreditDay = { date, amount };
      }
    });

    // Fetch previous month for comparison
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) { prevMonth = 12; prevYear -= 1; }
    const prevStartDate = new Date(prevYear, prevMonth - 1, 1, 0, 0, 0, 0);
    const prevEndDate = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999);

    const prevTransactions = await db.transaction.findMany({
      where: {
        createdAt: { gte: prevStartDate, lte: prevEndDate },
      },
      select: { type: true, amount: true },
    });

    const prevTotalCredit = prevTransactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const prevTotalRecovery = prevTransactions
      .filter((t) => t.type === 'recovery')
      .reduce((sum, t) => sum + t.amount, 0);

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
      creditCount: monthTransactions.filter((t) => t.type === 'credit').length,
      recoveryCount: monthTransactions.filter((t) => t.type === 'recovery').length,
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
