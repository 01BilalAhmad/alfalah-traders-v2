import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// GET /api/reports/balance-report?orderbookerId=xxx&companyId=xxx
// Returns shops with remaining balance > 0, grouped by orderbooker and company
export async function GET(request: NextRequest) {
  let client;
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId') || '';
    const companyId = searchParams.get('companyId') || '';

    client = getPgClient();
    await client.connect();

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

    const whereClause = whereConditions.join(' AND ');

    // Fetch shop balances grouped by orderbooker and company
    const balanceRes = await client.query(
      `SELECT 
        s.id as "shopId",
        s.name as "shopName",
        s.area as "shopArea",
        s.address as "shopAddress",
        s.phone as "shopPhone",
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
    const obRes = await client.query(
      'SELECT id, name FROM "User" WHERE role = \'orderbooker\' AND status = \'active\' ORDER BY name ASC'
    );

    // Fetch all companies for filter dropdown
    const compRes = await client.query(
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
        }[];
        totalBalance: number;
      }>;
      totalBalance: number;
    }> = {};

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
      });

      grouped[obId].companies[cId].totalBalance += row.remainingBalance;
      grouped[obId].totalBalance += row.remainingBalance;
    }

    // Convert to array and round totals
    const orderbookers = Object.values(grouped).map(ob => ({
      ...ob,
      totalBalance: Math.round(ob.totalBalance * 100) / 100,
      companies: Object.values(ob.companies).map(comp => ({
        ...comp,
        totalBalance: Math.round(comp.totalBalance * 100) / 100,
        shops: comp.shops,
      })),
    }));

    // Grand total
    const grandTotal = Math.round(orderbookers.reduce((s, ob) => s + ob.totalBalance, 0) * 100) / 100;

    await client.end();

    return NextResponse.json({
      orderbookers,
      grandTotal,
      filterOptions: {
        orderbookers: obRes.rows.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })),
        companies: compRes.rows.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })),
      },
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error generating balance report:', error);
    return NextResponse.json({ error: 'Failed to generate balance report' }, { status: 500 });
  }
}
