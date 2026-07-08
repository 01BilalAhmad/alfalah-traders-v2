import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// GET /api/reports/balance-report?orderbookerId=xxx&companyId=xxx&routeDay=xxx
// Returns shops with remaining balance > 0, grouped by orderbooker and company
// routeDay filter: when provided, only shows shops that have that route day
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId') || '';
    const companyId = searchParams.get('companyId') || '';
    const routeDay = searchParams.get('routeDay') || '';

    const pool = getPool();

    // Build the query for shops with remaining balance
    // Using ShopCompanyBalance for per-company balance
    let whereConditions = ['scb.balance > 0', 's.status = \'active\''];
    const params: string[] = [];
    let paramIdx = 1;

    if (orderbookerId) {
      whereConditions.push(`s."orderbookerId" = $${paramIdx}`);
      params.push(orderbookerId);
      paramIdx++;
    }

    if (companyId) {
      whereConditions.push(`scb."companyId" = $${paramIdx}`);
      params.push(companyId);
      paramIdx++;
    }

    // Filter by route day using PostgreSQL array containment ($N = ANY("routeDays"))
    if (routeDay) {
      const dayStr = routeDay.toLowerCase();
      const dayParamIdx = paramIdx;
      whereConditions.push(`($${dayParamIdx} = ANY(s."routeDays") OR EXISTS (
        SELECT 1 FROM "ShopOrderbooker" so2
        WHERE so2."shopId" = s.id AND $${dayParamIdx} = ANY(so2."routeDays")
        ${orderbookerId ? `AND so2."orderbookerId" = $1` : ''}
      ))`);
      params.push(dayStr);
      paramIdx++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Fetch shop balances grouped by orderbooker and company
    const balanceRes = await pool.query(
      `SELECT
        s.id as "shopId",
        s.name as "shopName",
        s.area as "shopArea",
        s.address as "shopAddress",
        s.phone as "shopPhone",
        s."routeDays",
        s."orderbookerId",
        ob.name as "orderbookerName",
        ob.phone as "orderbookerPhone",
        scb."companyId",
        c.name as "companyName",
        scb.balance as "remainingBalance",
        scb."creditLimit"
      FROM "ShopCompanyBalance" scb
      JOIN "Shop" s ON s.id = scb."shopId"
      JOIN "User" ob ON ob.id = s."orderbookerId"
      JOIN "Company" c ON c.id = scb."companyId"
      WHERE ${whereClause}
      ORDER BY ob.name ASC, c.name ASC, s.name ASC`,
      params
    );

    // Also fetch all orderbookers for filter dropdown
    const obRes = await pool.query(
      'SELECT id, name FROM "User" WHERE role = \'orderbooker\' AND status = \'active\' ORDER BY name ASC'
    );

    // Fetch all companies for filter dropdown
    const compRes = await pool.query(
      'SELECT id, name FROM "Company" WHERE status = \'active\' ORDER BY name ASC'
    );

    // Group data by orderbooker → company → shops
    const grouped: Record<string, {
      orderbookerId: string;
      orderbookerName: string;
      orderbookerPhone: string | null;
      companies: Record<string, {
        companyId: string;
        companyName: string;
        shops: {
          shopId: string;
          shopName: string;
          shopArea: string | null;
          shopAddress: string | null;
          shopPhone: string | null;
          remainingBalance: number;
          creditLimit: number;
          routeDays: string[];
        }[];
        totalBalance: number;
      }>;
      totalBalance: number;
    }> = {};

    // Track day-wise data per orderbooker (for day breakdown when no specific day is filtered)
    const dayWiseData: Record<string, Record<string, { shopIds: Set<string>; totalBalance: number }>> = {};

    // Track shop total balance (sum across companies) for day-wise calculation
    const shopBalanceMap: Record<string, number> = {};

    for (const row of balanceRes.rows) {
      const obId = row.orderbookerId;
      if (!grouped[obId]) {
        grouped[obId] = {
          orderbookerId: obId,
          orderbookerName: row.orderbookerName,
          orderbookerPhone: row.orderbookerPhone,
          companies: {},
          totalBalance: 0,
        };
        dayWiseData[obId] = {};
        for (const day of DAYS_ORDER) {
          dayWiseData[obId][day] = { shopIds: new Set<string>(), totalBalance: 0 };
        }
      }

      const cId = row.companyId;
      if (!grouped[obId].companies[cId]) {
        grouped[obId].companies[cId] = {
          companyId: cId,
          companyName: row.companyName,
          shops: [],
          totalBalance: 0,
        };
      }

      grouped[obId].companies[cId].shops.push({
        shopId: row.shopId,
        shopName: row.shopName,
        shopArea: row.shopArea,
        shopAddress: row.shopAddress,
        shopPhone: row.shopPhone,
        remainingBalance: Math.round(row.remainingBalance * 100) / 100,
        creditLimit: Math.round(row.creditLimit * 100) / 100,
        routeDays: row.routeDays || [],
      });

      grouped[obId].companies[cId].totalBalance += row.remainingBalance;
      grouped[obId].totalBalance += row.remainingBalance;

      // Track shop total balance
      if (!shopBalanceMap[row.shopId]) shopBalanceMap[row.shopId] = 0;
      shopBalanceMap[row.shopId] += row.remainingBalance;

      // Add to day-wise breakdown using shop's routeDays
      const rDays: string[] = row.routeDays || [];
      for (const day of rDays) {
        const dayLower = day.toLowerCase();
        if (dayWiseData[obId]?.[dayLower]) {
          dayWiseData[obId][dayLower].shopIds.add(row.shopId);
        }
      }
    }

    // Also fetch junction table data for day-wise breakdown (when no specific routeDay filter)
    if (!routeDay) {
      let junctionWhereConditions = ['scb.balance > 0', 's.status = \'active\''];
      const junctionParams: string[] = [];
      let jParamIdx = 1;

      if (orderbookerId) {
        junctionWhereConditions.push(`so."orderbookerId" = $${jParamIdx}`);
        junctionParams.push(orderbookerId);
        jParamIdx++;
      }

      if (companyId) {
        junctionWhereConditions.push(`scb."companyId" = $${jParamIdx}`);
        junctionParams.push(companyId);
        jParamIdx++;
      }

      const junctionWhereClause = junctionWhereConditions.join(' AND ');

      const junctionRes = await pool.query(
        `SELECT
          s.id as "shopId",
          so."routeDays" as "junctionRouteDays",
          so."orderbookerId"
        FROM "ShopOrderbooker" so
        JOIN "Shop" s ON s.id = so."shopId"
        JOIN "ShopCompanyBalance" scb ON scb."shopId" = s.id AND scb."companyId" = so."companyId"
        WHERE ${junctionWhereClause}`,
        junctionParams
      );

      for (const row of junctionRes.rows) {
        const obId = row.orderbookerId;
        if (!dayWiseData[obId]) {
          dayWiseData[obId] = {};
          for (const day of DAYS_ORDER) {
            dayWiseData[obId][day] = { shopIds: new Set<string>(), totalBalance: 0 };
          }
        }

        const junctionRouteDays: string[] = row.junctionRouteDays || [];
        for (const day of junctionRouteDays) {
          const dayLower = day.toLowerCase();
          if (dayWiseData[obId][dayLower]) {
            dayWiseData[obId][dayLower].shopIds.add(row.shopId);
          }
        }
      }
    }

    // Calculate day-wise totals using shop total balance
    for (const obId of Object.keys(dayWiseData)) {
      for (const day of DAYS_ORDER) {
        let dayTotal = 0;
        for (const shopId of dayWiseData[obId][day].shopIds) {
          dayTotal += shopBalanceMap[shopId] || 0;
        }
        dayWiseData[obId][day].totalBalance = Math.round(dayTotal * 100) / 100;
      }
    }

    // Convert to array and round totals
    const orderbookers = Object.values(grouped).map(ob => {
      const dayBreakdown = DAYS_ORDER.map(day => ({
        day,
        dayLabel: day.charAt(0).toUpperCase() + day.slice(1),
        shopCount: dayWiseData[ob.orderbookerId]?.[day]?.shopIds?.size || 0,
        totalBalance: dayWiseData[ob.orderbookerId]?.[day]?.totalBalance || 0,
      })).filter(d => d.shopCount > 0);

      return {
        ...ob,
        totalBalance: Math.round(ob.totalBalance * 100) / 100,
        dayBreakdown,
        companies: Object.values(ob.companies).map(comp => ({
          ...comp,
          totalBalance: Math.round(comp.totalBalance * 100) / 100,
          shops: comp.shops,
        })),
      };
    });

    // Grand total
    const grandTotal = Math.round(orderbookers.reduce((s, ob) => s + ob.totalBalance, 0) * 100) / 100;

    return NextResponse.json({
      orderbookers,
      grandTotal,
      selectedDay: routeDay || null,
      filterOptions: {
        orderbookers: obRes.rows.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })),
        companies: compRes.rows.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })),
      },
    });
  } catch (error) {
    console.error('Error generating balance report:', error);
    return NextResponse.json({ error: 'Failed to generate balance report' }, { status: 500 });
  }
}
