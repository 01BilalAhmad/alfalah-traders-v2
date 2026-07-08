import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/company-credit-recovery?companyId=xxx&month=2026-05
// Returns days-wise credit & recovery grouped by orderbooker for a specific company
export async function GET(request: NextRequest) {
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

    const pool = getPool();

    // 1. Verify company exists
    const companyRes = await pool.query(
      'SELECT id, name FROM "Company" WHERE id = $1',
      [companyId]
    );
    if (companyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const companyName = companyRes.rows[0].name;

    // 2. Get all orderbookers for this company
    // Check UserCompany junction table (multi-company), ShopOrderbooker, AND legacy User.companyId
    const obRes = await pool.query(
      `SELECT DISTINCT u.id, u.name
       FROM "User" u
       WHERE u.role = 'orderbooker'
         AND u.status = 'active'
         AND (
           u."companyId" = $1
           OR EXISTS (SELECT 1 FROM "UserCompany" uc WHERE uc."userId" = u.id AND uc."companyId" = $1)
           OR EXISTS (SELECT 1 FROM "ShopOrderbooker" so WHERE so."orderbookerId" = u.id AND so."companyId" = $1)
         )
       ORDER BY u.name ASC`,
      [companyId]
    );
    const orderbookers = obRes.rows.map((r: { id: string; name: string }) => ({
      id: r.id,
      name: r.name,
    }));

    const orderbookerIds = orderbookers.map((ob: { id: string }) => ob.id);

    if (orderbookerIds.length === 0) {
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
        obTotals: {},
        openingBalances: {},
        grandTotals: { credit: 0, recovery: 0, balance: 0 },
        workingDays: 0,
      });
    }

    // 3. Get CURRENT balance for each orderbooker under this company
    // This is the sum of ShopCompanyBalance for ACTIVE shops belonging to each OB
    // NOTE: This is the CURRENT balance (includes all transactions up to now)
    // We will calculate the TRUE opening balance later by subtracting this month's transactions
    const openingBalRes = await pool.query(
      `SELECT s."orderbookerId", COALESCE(SUM(scb.balance), 0) AS "currentBalance"
       FROM "ShopCompanyBalance" scb
       JOIN "Shop" s ON s.id = scb."shopId"
       WHERE scb."companyId" = $1
         AND s."orderbookerId" IN (${orderbookerIds.map((_: string, idx: number) => `$${idx + 2}`).join(', ')})
         AND s.status = 'active'
       GROUP BY s."orderbookerId"`,
      [companyId, ...orderbookerIds]
    );
    const currentBalances: Record<string, number> = {};
    for (const row of openingBalRes.rows) {
      currentBalances[row.orderbookerId] = Math.round(Number(row.currentBalance) * 100) / 100;
    }
    // Initialize OBs with no ShopCompanyBalance entries
    for (const ob of orderbookers) {
      if (currentBalances[ob.id] === undefined) {
        currentBalances[ob.id] = 0;
      }
    }

    // 4. Fetch all CREDIT transactions for this company in the month
    const creditRes = await pool.query(
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

    // 5. Fetch all RECOVERY transactions for this company's orderbookers in the month
    // IMPORTANT: Filter by companyId so recovery from OTHER companies is NOT included
    // FIX: Join with Shop table and filter by shop's orderbookerId instead of transaction's createdBy
    // This ensures admin-posted recoveries (where createdBy = admin) are also included,
    // attributed to the correct orderbooker based on the shop's assignment
    const obPlaceholders = orderbookerIds.map((_: string, idx: number) => `$${idx + 4}`).join(', ');
    const recoveryRes = await pool.query(
      `SELECT t."shopId", t."createdBy", t.amount, t."createdAt",
              s."orderbookerId" AS "shop_orderbookerId"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       WHERE t."companyId" = $3
         AND s."orderbookerId" IN (${obPlaceholders})
         AND t.type IN ('recovery', 'supplier_collection')
         AND t.status = 'approved'
         AND t."createdAt" >= $1
         AND t."createdAt" <= $2
       ORDER BY t."createdAt" ASC`,
      [startDate.toISOString(), endDate.toISOString(), companyId, ...orderbookerIds]
    );

    // 6. Build the data structure
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: { date: string; label: string }[] = [];

    // Initialize data map: date -> orderbookerId -> { credit, recovery, balance }
    const dataMap: Record<string, Record<string, { credit: number; recovery: number; balance: number }>> = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const label = `${String(d).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(year).slice(2)}`;
      days.push({ date: dateStr, label });
      dataMap[dateStr] = {};
      for (const ob of orderbookers) {
        dataMap[dateStr][ob.id] = { credit: 0, recovery: 0, balance: 0 };
      }
    }

    // Helper: extract date string from createdAt in Pakistan timezone
    function getPakistanDate(createdAt: Date | string): string {
      const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
      const pkTime = new Date(d.getTime() + (5 * 60 * 60 * 1000));
      return `${pkTime.getUTCFullYear()}-${String(pkTime.getUTCMonth() + 1).padStart(2, '0')}-${String(pkTime.getUTCDate()).padStart(2, '0')}`;
    }

    // Fill credit data
    for (const row of creditRes.rows) {
      const dateStr = getPakistanDate(row.createdAt);
      const obId = row.shop_orderbookerId || row.createdBy;
      if (dataMap[dateStr] && dataMap[dateStr][obId] !== undefined) {
        dataMap[dateStr][obId].credit += Number(row.amount);
      }
    }

    // Fill recovery data
    // FIX: Use shop's orderbookerId for attribution instead of createdBy
    // This way admin-posted recoveries are attributed to the correct orderbooker
    for (const row of recoveryRes.rows) {
      const dateStr = getPakistanDate(row.createdAt);
      const obId = row.shop_orderbookerId || row.createdBy;
      if (dataMap[dateStr] && dataMap[dateStr][obId] !== undefined) {
        dataMap[dateStr][obId].recovery += Number(row.amount);
      }
    }

    // 7. Calculate TRUE opening balance and running closing balances
    // True Opening = Current Balance - (this month's credits) + (this month's recoveries)
    // Because current balance already includes this month's transactions
    const openingBalances: Record<string, number> = {};
    const obRunningBal: Record<string, number> = {};
    for (const ob of orderbookers) {
      // First calculate month totals per OB
      let obMonthCredit = 0;
      let obMonthRecovery = 0;
      for (const day of days) {
        const entry = dataMap[day.date][ob.id];
        obMonthCredit += entry.credit;
        obMonthRecovery += entry.recovery;
      }
      // True opening = current balance minus this month's net activity
      openingBalances[ob.id] = Math.round(((currentBalances[ob.id] || 0) - obMonthCredit + obMonthRecovery) * 100) / 100;
      obRunningBal[ob.id] = openingBalances[ob.id];
    }

    for (const day of days) {
      for (const ob of orderbookers) {
        const entry = dataMap[day.date][ob.id];
        obRunningBal[ob.id] += entry.credit - entry.recovery;
        entry.balance = Math.round(obRunningBal[ob.id] * 100) / 100;
      }
    }

    // Calculate OB totals
    const obTotals: Record<string, { credit: number; recovery: number; balance: number }> = {};
    for (const ob of orderbookers) {
      obTotals[ob.id] = { credit: 0, recovery: 0, balance: 0 };
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

    // Set OB total balance = last day's balance (closing balance for the month)
    for (const ob of orderbookers) {
      const lastDayWithData = [...days].reverse().find(day => {
        const entry = dataMap[day.date][ob.id];
        return entry.credit > 0 || entry.recovery > 0 || entry.balance !== (openingBalances[ob.id] || 0);
      });
      obTotals[ob.id].balance = lastDayWithData
        ? dataMap[lastDayWithData.date][ob.id].balance
        : (openingBalances[ob.id] || 0);
    }

    // Round all values
    for (const day of days) {
      for (const ob of orderbookers) {
        dataMap[day.date][ob.id].credit = Math.round(dataMap[day.date][ob.id].credit * 100) / 100;
        dataMap[day.date][ob.id].recovery = Math.round(dataMap[day.date][ob.id].recovery * 100) / 100;
        dataMap[day.date][ob.id].balance = Math.round(dataMap[day.date][ob.id].balance * 100) / 100;
      }
    }
    for (const ob of orderbookers) {
      obTotals[ob.id].credit = Math.round(obTotals[ob.id].credit * 100) / 100;
      obTotals[ob.id].recovery = Math.round(obTotals[ob.id].recovery * 100) / 100;
      obTotals[ob.id].balance = Math.round(obTotals[ob.id].balance * 100) / 100;
    }

    // Grand total balance = sum of all OB closing balances
    const grandBalance = Math.round(
      orderbookers.reduce((sum, ob) => sum + obTotals[ob.id].balance, 0) * 100
    ) / 100;

    return NextResponse.json({
      company: { id: companyId, name: companyName },
      month: `${year}-${String(month).padStart(2, '0')}`,
      monthLabel: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      days,
      orderbookers,
      data: dataMap,
      obTotals,
      openingBalances,
      currentBalances,
      grandTotals: {
        credit: Math.round(grandCredit * 100) / 100,
        recovery: Math.round(grandRecovery * 100) / 100,
        balance: grandBalance,
      },
      workingDays,
    });
  } catch (error) {
    console.error('Error generating company credit-recovery report:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
