import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/credit-recovery-analysis
// Query params: companyId (required), orderbookerId, startDate, endDate
interface DailyRow {
  date: string;
  label: string;
  credit: number;
  recovery: number;
  cumulativeCredit: number;
  cumulativeRecovery: number;
  net: number;
}

interface OBBreakdownRow {
  orderbookerId: string;
  orderbookerName: string;
  totalCredit: number;
  totalRecovery: number;
  net: number;
  shopCount: number;
  dailyData: { date: string; credit: number; recovery: number }[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const orderbookerId = searchParams.get('orderbookerId');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }
    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    const [sy, sm, sd] = startDateStr.split('-').map(Number);
    const [ey, em, ed] = endDateStr.split('-').map(Number);
    const startUTC = new Date(Date.UTC(sy, sm - 1, sd, -5, 0, 0, 0));
    const endUTC = new Date(Date.UTC(ey, em - 1, ed, 18, 59, 59, 999));

    const pool = getPool();
    const companyRes = await pool.query('SELECT id, name FROM "Company" WHERE id = $1', [companyId]);
    if (companyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const companyName = companyRes.rows[0].name;

    const params: (string | Date)[] = [companyId, startUTC, endUTC];
    let obFilter = '';
    if (orderbookerId && orderbookerId !== 'all') {
      obFilter = ` AND s."orderbookerId" = $4`;
      params.push(orderbookerId);
    }

    const txRes = await pool.query(
      `SELECT DATE(t."createdAt" AT TIME ZONE 'Asia/Karachi') AS pk_date,
              s."orderbookerId" AS ob_id, u.name AS ob_name, t.type, t.amount
       FROM "Transaction" t
       JOIN "Shop" s ON t."shopId" = s.id
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       WHERE t."companyId" = $1 AND t."createdAt" >= $2 AND t."createdAt" <= $3
         AND t.status = 'approved' AND t.type IN ('credit', 'recovery', 'supplier_collection')${obFilter}
       ORDER BY t."createdAt" ASC`,
      params
    );

    const dailyMap: Record<string, { credit: number; recovery: number }> = {};
    const obMap: Record<string, { name: string; credit: number; recovery: number; shops: Set<string>; daily: Record<string, { credit: number; recovery: number }> }> = {};

    for (const row of txRes.rows) {
      const dateObj = row.pk_date instanceof Date ? row.pk_date : new Date(row.pk_date);
      const dateStr = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
      if (!dailyMap[dateStr]) dailyMap[dateStr] = { credit: 0, recovery: 0 };
      const isRecovery = row.type === 'recovery' || row.type === 'supplier_collection';
      const amount = Number(row.amount);
      if (isRecovery) dailyMap[dateStr].recovery += amount;
      else dailyMap[dateStr].credit += amount;

      const obId = row.ob_id || 'unknown';
      const obName = row.ob_name || 'Unassigned';
      if (!obMap[obId]) obMap[obId] = { name: obName, credit: 0, recovery: 0, shops: new Set(), daily: {} };
      if (isRecovery) obMap[obId].recovery += amount;
      else obMap[obId].credit += amount;
      if (!obMap[obId].daily[dateStr]) obMap[obId].daily[dateStr] = { credit: 0, recovery: 0 };
      if (isRecovery) obMap[obId].daily[dateStr].recovery += amount;
      else obMap[obId].daily[dateStr].credit += amount;
    }

    const dailyData: DailyRow[] = [];
    let cumCredit = 0, cumRecovery = 0;
    const cursor = new Date(startUTC);
    cursor.setUTCHours(5, 0, 0, 0);
    while (cursor <= endUTC) {
      const dateStr = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`;
      const label = `${String(cursor.getUTCDate()).padStart(2, '0')}/${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      const dayData = dailyMap[dateStr] || { credit: 0, recovery: 0 };
      cumCredit += dayData.credit;
      cumRecovery += dayData.recovery;
      dailyData.push({
        date: dateStr, label, credit: Math.round(dayData.credit * 100) / 100,
        recovery: Math.round(dayData.recovery * 100) / 100,
        cumulativeCredit: Math.round(cumCredit * 100) / 100,
        cumulativeRecovery: Math.round(cumRecovery * 100) / 100,
        net: Math.round((cumCredit - cumRecovery) * 100) / 100,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const obBreakdown: OBBreakdownRow[] = Object.entries(obMap).map(([obId, data]) => ({
      orderbookerId: obId, orderbookerName: data.name,
      totalCredit: Math.round(data.credit * 100) / 100,
      totalRecovery: Math.round(data.recovery * 100) / 100,
      net: Math.round((data.credit - data.recovery) * 100) / 100,
      shopCount: data.shops.size,
      dailyData: Object.entries(data.daily).map(([date, vals]) => ({
        date, credit: Math.round(vals.credit * 100) / 100, recovery: Math.round(vals.recovery * 100) / 100,
      })).sort((a, b) => a.date.localeCompare(b.date)),
    }));
    obBreakdown.sort((a, b) => b.totalCredit + b.totalRecovery - (a.totalCredit + a.totalRecovery));

    const totalCredit = Math.round(dailyData.reduce((s, d) => s + d.credit, 0) * 100) / 100;
    const totalRecovery = Math.round(dailyData.reduce((s, d) => s + d.recovery, 0) * 100) / 100;
    const daysWithData = dailyData.filter((d) => d.credit > 0 || d.recovery > 0).length;

    return NextResponse.json({
      period: { startDate: startDateStr, endDate: endDateStr },
      company: { id: companyId, name: companyName },
      orderbookerFilter: orderbookerId || 'all',
      dailyData, obBreakdown,
      summary: {
        totalCredit, totalRecovery,
        netPosition: Math.round((totalCredit - totalRecovery) * 100) / 100,
        recoveryRate: totalCredit > 0 ? Math.round((totalRecovery / totalCredit) * 10000) / 100 : 0,
        daysWithData, totalDays: dailyData.length,
        avgCreditPerDay: daysWithData > 0 ? Math.round((totalCredit / daysWithData) * 100) / 100 : 0,
        avgRecoveryPerDay: daysWithData > 0 ? Math.round((totalRecovery / daysWithData) * 100) / 100 : 0,
      },
    });
  } catch (error) {
    console.error('[Credit-Recovery Analysis API] Error:', error);
    return NextResponse.json({ error: `Failed: ${(error as Error)?.message || 'Unknown'}` }, { status: 500 });
  }
}
