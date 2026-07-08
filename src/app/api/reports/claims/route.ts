import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/claims
// Query params:
//   companyId (required)
//   orderbookerId (optional, 'all' or specific id)
//   startDate (required, YYYY-MM-DD)
//   endDate (required, YYYY-MM-DD)
// Returns:
//   - claims[]: each claim transaction with shop + OB + company + creator details
//   - obSummary[]: per-OB breakdown with shops list
//   - totals: grand totals (count, amount)
//   - period: { startDate, endDate }

interface ClaimRow {
  id: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string | null;
  createdAt: string;
  companyId: string | null;
  companyName: string | null;
  shopId: string;
  shopName: string;
  shopArea: string | null;
  shopAddress: string | null;
  orderbookerId: string;
  orderbookerName: string;
  creatorId: string | null;
  creatorName: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const orderbookerId = searchParams.get('orderbookerId');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    // ─── Validation ───
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }
    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ error: 'startDate and endDate are required (YYYY-MM-DD)' }, { status: 400 });
    }

    // Parse dates — assume Pakistan timezone (UTC+5)
    // startDate: 00:00 PKT = previous day 19:00 UTC
    // endDate: 23:59:59 PKT = same day 18:59:59 UTC
    const [sy, sm, sd] = startDateStr.split('-').map(Number);
    const [ey, em, ed] = endDateStr.split('-').map(Number);
    if (!sy || !sm || !sd || !ey || !em || !ed) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }
    const startUTC = new Date(Date.UTC(sy, sm - 1, sd, -5, 0, 0, 0));
    const endUTC = new Date(Date.UTC(ey, em - 1, ed, 18, 59, 59, 999));

    const pool = getPool();

    // ─── Build query params ───
    const params: (string | Date)[] = [companyId, startUTC, endUTC];
    let obFilter = '';
    if (orderbookerId && orderbookerId !== 'all') {
      obFilter = ` AND s."orderbookerId" = $4`;
      params.push(orderbookerId);
    }

    // ─── Fetch all claim transactions in the date range for this company ───
    // Attribution: use Shop.orderbookerId (same as Company Credit & Recovery Report)
    const claimsRes = await pool.query(
      `SELECT t.id, t.amount, t."previousBalance", t."newBalance", t.description, t."createdAt",
              t."companyId", co.name AS "companyName",
              t."shopId", s.name AS "shopName", s.area AS "shopArea", s.address AS "shopAddress",
              s."orderbookerId", u.name AS "orderbookerName",
              t."createdBy" AS "creatorId", cu.name AS "creatorName"
       FROM "Transaction" t
       JOIN "Shop" s ON t."shopId" = s.id
       LEFT JOIN "Company" co ON t."companyId" = co.id
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       LEFT JOIN "User" cu ON t."createdBy" = cu.id
       WHERE t."companyId" = $1
         AND t.type = 'claim'
         AND t.status = 'approved'
         AND t."createdAt" >= $2
         AND t."createdAt" <= $3${obFilter}
       ORDER BY t."createdAt" DESC`,
      params
    );

    const claims: ClaimRow[] = claimsRes.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      amount: Number(r.amount),
      previousBalance: Number(r.previousBalance),
      newBalance: Number(r.newBalance),
      description: (r.description as string) ?? null,
      createdAt: r.createdAt instanceof Date ? (r.createdAt as Date).toISOString() : String(r.createdAt),
      companyId: (r.companyId as string) ?? null,
      companyName: (r.companyName as string) ?? null,
      shopId: r.shopId as string,
      shopName: (r.shopName as string) ?? 'Unknown',
      shopArea: (r.shopArea as string) ?? null,
      shopAddress: (r.shopAddress as string) ?? null,
      orderbookerId: (r.orderbookerId as string) ?? 'unknown',
      orderbookerName: (r.orderbookerName as string) ?? 'Unassigned',
      creatorId: (r.creatorId as string) ?? null,
      creatorName: (r.creatorName as string) ?? null,
    }));

    // ─── Build per-OB summary with shops breakdown ───
    type ShopBreakdown = {
      shopId: string;
      shopName: string;
      shopArea: string | null;
      shopAddress: string | null;
      claimCount: number;
      totalAmount: number;
      lastClaimDate: string;
      claims: {
        id: string;
        amount: number;
        description: string | null;
        createdAt: string;
        creatorName: string | null;
      }[];
    };

    type OBSummary = {
      orderbookerId: string;
      orderbookerName: string;
      totalShops: number;
      totalClaims: number;
      totalAmount: number;
      lastClaimDate: string | null;
      shops: ShopBreakdown[];
    };

    // Group by OB
    const obMap: Record<string, OBSummary> = {};
    // Group by OB -> Shop
    const obShopMap: Record<string, Record<string, ShopBreakdown>> = {};

    for (const c of claims) {
      const obKey = c.orderbookerId;
      const obName = c.orderbookerName;

      if (!obMap[obKey]) {
        obMap[obKey] = {
          orderbookerId: obKey,
          orderbookerName: obName,
          totalShops: 0,
          totalClaims: 0,
          totalAmount: 0,
          lastClaimDate: null,
          shops: [],
        };
        obShopMap[obKey] = {};
      }

      obMap[obKey].totalClaims += 1;
      obMap[obKey].totalAmount += c.amount;
      if (!obMap[obKey].lastClaimDate || c.createdAt > obMap[obKey].lastClaimDate!) {
        obMap[obKey].lastClaimDate = c.createdAt;
      }

      if (!obShopMap[obKey][c.shopId]) {
        obShopMap[obKey][c.shopId] = {
          shopId: c.shopId,
          shopName: c.shopName,
          shopArea: c.shopArea,
          shopAddress: c.shopAddress,
          claimCount: 0,
          totalAmount: 0,
          lastClaimDate: c.createdAt,
          claims: [],
        };
      }
      obShopMap[obKey][c.shopId].claimCount += 1;
      obShopMap[obKey][c.shopId].totalAmount += c.amount;
      if (c.createdAt > obShopMap[obKey][c.shopId].lastClaimDate) {
        obShopMap[obKey][c.shopId].lastClaimDate = c.createdAt;
      }
      obShopMap[obKey][c.shopId].claims.push({
        id: c.id,
        amount: c.amount,
        description: c.description,
        createdAt: c.createdAt,
        creatorName: c.creatorName,
      });
    }

    // Convert obShopMap into obMap.shops arrays
    const obSummary: OBSummary[] = Object.values(obMap).map((ob) => {
      const shopsArr = Object.values(obShopMap[ob.orderbookerId]);
      // Sort shops by totalAmount desc
      shopsArr.sort((a, b) => b.totalAmount - a.totalAmount);
      return {
        ...ob,
        totalShops: shopsArr.length,
        totalAmount: Math.round(ob.totalAmount * 100) / 100,
        shops: shopsArr.map((s) => ({
          ...s,
          totalAmount: Math.round(s.totalAmount * 100) / 100,
        })),
      };
    });

    // Sort OBs by totalAmount desc
    obSummary.sort((a, b) => b.totalAmount - a.totalAmount);

    // ─── Calculate totals ───
    const totalAmount = Math.round(claims.reduce((s, c) => s + c.amount, 0) * 100) / 100;
    const totalCount = claims.length;

    // Today's claims (Pakistan timezone)
    const nowPk = new Date(Date.now() + 5 * 60 * 60 * 1000);
    const todayStr = `${nowPk.getUTCFullYear()}-${String(nowPk.getUTCMonth() + 1).padStart(2, '0')}-${String(nowPk.getUTCDate()).padStart(2, '0')}`;
    const todayCount = claims.filter((c) => c.createdAt.slice(0, 10) === todayStr).length;
    const todayAmount = Math.round(
      claims.filter((c) => c.createdAt.slice(0, 10) === todayStr).reduce((s, c) => s + c.amount, 0) * 100
    ) / 100;

    // This month's claims (Pakistan timezone)
    const monthStr = todayStr.slice(0, 7);
    const monthCount = claims.filter((c) => c.createdAt.slice(0, 7) === monthStr).length;
    const monthAmount = Math.round(
      claims.filter((c) => c.createdAt.slice(0, 7) === monthStr).reduce((s, c) => s + c.amount, 0) * 100
    ) / 100;

    return NextResponse.json({
      period: { startDate: startDateStr, endDate: endDateStr },
      companyName: claims[0]?.companyName ?? null,
      claims,
      obSummary,
      totals: {
        count: totalCount,
        amount: totalAmount,
        todayCount,
        todayAmount,
        monthCount,
        monthAmount,
      },
    });
  } catch (error) {
    console.error('[Claims Report API] Error:', error);
    return NextResponse.json(
      { error: `Failed to generate claims report: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
