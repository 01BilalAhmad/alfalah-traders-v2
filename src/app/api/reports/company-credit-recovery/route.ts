import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// GET /api/reports/company-credit-recovery?companyId=xxx&month=2026-05
// Returns days-wise credit & recovery grouped by orderbooker for a specific company
export async function GET(request: NextRequest) {
  let client;
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const monthParam = searchParams.get('month');

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

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

    // Calculate month boundaries in Pakistan timezone (UTC+5)
    const startDate = new Date(Date.UTC(year, month - 1, 1, -5, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 18, 59, 59, 999));

    client = getPgClient();
    await client.connect();

    // 1. Verify company exists
    const companyRes = await client.query(
      'SELECT id, name FROM "Company" WHERE id = $1',
      [companyId]
    );
    if (companyRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const companyName = companyRes.rows[0].name;

    // 2. Get all orderbookers for this company
    const obRes = await client.query(
      `SELECT id, name FROM "User" WHERE role = 'orderbooker' AND "companyId" = $1 AND status = 'active' ORDER BY name ASC`,
      [companyId]
    );
    const orderbookers = obRes.rows.map((r: { id: string; name: string }) => ({
      id: r.id,
      name: r.name,
    }));

    const orderbookerIds = orderbookers.map((ob: { id: string }) => ob.id);

    if (orderbookerIds.length === 0) {
      await client.end();
      // Return empty structure
      const daysInMonth = new Date(year, month, 0).getDate();
      const days: { date: string; label: string }[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push({ date: dateStr, label: `${String(d).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(year).slice(2)}` });
      }
      return NextResponse.json({
        company: { id: companyId, name: companyName },
        month: `${year}-${String(month).padStart(2, '0')}`,
        monthLabel: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        days,
        orderbookers: [],
        data: {},
        grandTotals: { credit: 0, recovery: 0 },
        workingDays: 0,
      });
    }

    // 3. Fetch all CREDIT transactions for this company in the month
    // Credit transactions have companyId set directly
    const creditRes = await client.query(
      `SELECT t."shopId", t."createdBy", t.amount, t."createdAt",
              s."orderbookerId" AS "shop_orderbookerId"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       WHERE t."companyId" = $1
         AND t.type = 'credit'
         AND t.status = 'approved'
         AND t."createdAt" >= $2
         AND t."createdAt" <= $3
       ORDER BY t."createdAt" ASC`,
      [companyId, startDate.toISOString(), endDate.toISOString()]
    );

    // 4. Fetch all RECOVERY transactions from this company's orderbookers in the month
    // Recovery transactions are linked via the orderbooker's company
    const obPlaceholders = orderbookerIds.map((_: string, idx: number) => `$${idx + 3}`).join(', ');
    const recoveryRes = await client.query(
      `SELECT t."shopId", t."createdBy", t.amount, t."createdAt"
       FROM "Transaction" t
       WHERE t."createdBy" IN (${obPlaceholders})
         AND t.type = 'recovery'
         AND t.status = 'approved'
         AND t."createdAt" >= $1
         AND t."createdAt" <= $2
       ORDER BY t."createdAt" ASC`,
      [startDate.toISOString(), endDate.toISOString(), ...orderbookerIds]
    );

    // 5. Build the data structure
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: { date: string; label: string }[] = [];

    // Initialize data map: date -> orderbookerId -> { credit, recovery }
    const dataMap: Record<string, Record<string, { credit: number; recovery: number }>> = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const label = `${String(d).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(year).slice(2)}`;
      days.push({ date: dateStr, label });
      dataMap[dateStr] = {};
      for (const ob of orderbookers) {
        dataMap[dateStr][ob.id] = { credit: 0, recovery: 0 };
      }
    }

    // Helper: extract date string from createdAt in Pakistan timezone
    function getPakistanDate(createdAt: Date | string): string {
      const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
      // Pakistan is UTC+5
      const pkTime = new Date(d.getTime() + (5 * 60 * 60 * 1000));
      return `${pkTime.getUTCFullYear()}-${String(pkTime.getUTCMonth() + 1).padStart(2, '0')}-${String(pkTime.getUTCDate()).padStart(2, '0')}`;
    }

    // Fill credit data — use shop's orderbookerId to assign to correct OB
    for (const row of creditRes.rows) {
      const dateStr = getPakistanDate(row.createdAt);
      const obId = row.shop_orderbookerId || row.createdBy;
      if (dataMap[dateStr] && dataMap[dateStr][obId] !== undefined) {
        dataMap[dateStr][obId].credit += Number(row.amount);
      }
    }

    // Fill recovery data — use createdBy (orderbooker) directly
    for (const row of recoveryRes.rows) {
      const dateStr = getPakistanDate(row.createdAt);
      const obId = row.createdBy;
      if (dataMap[dateStr] && dataMap[dateStr][obId] !== undefined) {
        dataMap[dateStr][obId].recovery += Number(row.amount);
      }
    }

    // Calculate OB totals
    const obTotals: Record<string, { credit: number; recovery: number }> = {};
    for (const ob of orderbookers) {
      obTotals[ob.id] = { credit: 0, recovery: 0 };
    }

    let grandCredit = 0;
    let grandRecovery = 0;
    let workingDays = 0;

    for (const day of days) {
      let dayHasData = false;
      for (const ob of orderbookers) {
        const entry = dataMap[day.date][ob.id];
        obTotals[ob.id].credit += entry.credit;
        obTotals[ob.id].recovery += entry.recovery;
        grandCredit += entry.credit;
        grandRecovery += entry.recovery;
        if (entry.credit > 0 || entry.recovery > 0) {
          dayHasData = true;
        }
      }
      if (dayHasData) workingDays++;
    }

    // Round all values
    for (const day of days) {
      for (const ob of orderbookers) {
        dataMap[day.date][ob.id].credit = Math.round(dataMap[day.date][ob.id].credit * 100) / 100;
        dataMap[day.date][ob.id].recovery = Math.round(dataMap[day.date][ob.id].recovery * 100) / 100;
      }
    }
    for (const ob of orderbookers) {
      obTotals[ob.id].credit = Math.round(obTotals[ob.id].credit * 100) / 100;
      obTotals[ob.id].recovery = Math.round(obTotals[ob.id].recovery * 100) / 100;
    }

    await client.end();

    return NextResponse.json({
      company: { id: companyId, name: companyName },
      month: `${year}-${String(month).padStart(2, '0')}`,
      monthLabel: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      days,
      orderbookers,
      data: dataMap,
      obTotals,
      grandTotals: {
        credit: Math.round(grandCredit * 100) / 100,
        recovery: Math.round(grandRecovery * 100) / 100,
      },
      workingDays,
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error generating company credit-recovery report:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
