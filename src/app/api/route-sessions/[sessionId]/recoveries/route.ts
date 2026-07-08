import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/route-sessions/[sessionId]/recoveries
// Returns a per-shop recovery summary for a specific route session.
//
// Query params:
//   - orderbookerId (optional, for filtering — defaults to session's orderbookerId)
//
// Response shape:
// {
//   sessionId, sessionStartTime, sessionEndTime, sessionStatus,
//   totalRecovery, totalPending, totalApproved, totalRejected,
//   shops: [
//     {
//       shopId, shopName, shopArea,
//       totalRecovery, pendingCount, approvedCount, rejectedCount,
//       entries: [
//         { id, amount, status, description, gpsLat, gpsLng, gpsAddress,
//           createdAt, createdBy, createdByName, approvedBy, approvedAt, rejectReason, isEditable }
//       ]
//     }, ...
//   ]
// }
//
// Notes:
//   - Only shops with at least one recovery transaction are returned.
//   - isEditable = (status === 'pending') — used by mobile UI to lock approved entries.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const pool = getPool();

    // 1. Fetch the session
    const sessionRes = await pool.query(
      `SELECT id, "orderbookerId", "startTime", "endTime", status
       FROM "RouteSession" WHERE id = $1`,
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const session = sessionRes.rows[0];

    // Optional: enforce orderbookerId matches session owner
    const effectiveOrderbookerId = orderbookerId || session.orderbookerId;

    // 2. Fetch all recovery transactions created by this orderbooker during the session window.
    //    Session window = [startTime, COALESCE(endTime, NOW())].
    //    Use type = 'recovery' only (credits are separate).
    const startTimeISO =
      session.startTime instanceof Date ? session.startTime.toISOString() : session.startTime;
    const endTimeRaw =
      session.endTime instanceof Date
        ? session.endTime.toISOString()
        : session.endTime || new Date().toISOString();

    const txnsRes = await pool.query(
      `SELECT
         t.id, t."shopId", t.amount, t.status, t.description,
         t."gpsLat", t."gpsLng", t."gpsAddress",
         t."createdBy", t."approvedBy", t."approvedAt", t."rejectReason",
         t."createdAt",
         s.name AS "shopName", s.area AS "shopArea", s.balance AS "shopBalance",
         c.name AS "createdByName",
         a.name AS "approvedByName"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       LEFT JOIN "User" c ON t."createdBy" = c.id
       LEFT JOIN "User" a ON t."approvedBy" = a.id
       WHERE t.type = 'recovery'
         AND t."createdBy" = $1
         AND t."createdAt" >= $2
         AND t."createdAt" <= $3
       ORDER BY t."createdAt" ASC`,
      [effectiveOrderbookerId, startTimeISO, endTimeRaw]
    );

    // 3. Group by shop
    const shopMap: Record<string, {
      shopId: string;
      shopName: string;
      shopArea: string | null;
      shopBalance: number;
      totalRecovery: number;
      pendingCount: number;
      approvedCount: number;
      rejectedCount: number;
      entries: any[];
    }> = {};

    let grandTotalRecovery = 0;
    let grandTotalPending = 0;
    let grandTotalApproved = 0;
    let grandTotalRejected = 0;

    for (const t of txnsRes.rows) {
      const amount = Number(t.amount);
      const status = t.status;

      // Skip rejected from totals but still list them (for audit visibility)
      if (status !== 'rejected') {
        grandTotalRecovery += amount;
      }
      if (status === 'pending') grandTotalPending += amount;
      if (status === 'approved') grandTotalApproved += amount;
      if (status === 'rejected') grandTotalRejected += amount;

      if (!shopMap[t.shopId]) {
        shopMap[t.shopId] = {
          shopId: t.shopId,
          shopName: t.shopName || 'Unknown Shop',
          shopArea: t.shopArea || null,
          shopBalance: Number(t.shopBalance ?? 0),
          totalRecovery: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          entries: [],
        };
      }

      const shop = shopMap[t.shopId];
      if (status !== 'rejected') {
        shop.totalRecovery += amount;
      }
      if (status === 'pending') shop.pendingCount += 1;
      if (status === 'approved') shop.approvedCount += 1;
      if (status === 'rejected') shop.rejectedCount += 1;

      const createdAtISO =
        t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt;
      const approvedAtISO =
        t.approvedAt instanceof Date ? t.approvedAt.toISOString() : t.approvedAt;

      shop.entries.push({
        id: t.id,
        amount,
        status,
        description: t.description,
        gpsLat: t.gpsLat,
        gpsLng: t.gpsLng,
        gpsAddress: t.gpsAddress,
        createdAt: createdAtISO,
        createdBy: t.createdBy,
        createdByName: t.createdByName,
        approvedBy: t.approvedBy,
        approvedByName: t.approvedByName,
        approvedAt: approvedAtISO,
        rejectReason: t.rejectReason,
        // Lock rule: only pending recoveries are editable.
        isEditable: status === 'pending',
      });
    }

    const shops = Object.values(shopMap).sort((a, b) => b.totalRecovery - a.totalRecovery);

    // ── Per-OB remaining balance ────────────────────────────────────
    // The user wants the "Remaining" balance on the route-summary to show
    // ONLY what THIS orderbooker needs to collect — not the shop's total
    // balance across all companies/OBs.
    //
    // Logic: for each shop, sum ShopCompanyBalance.balance for companies
    // that are assigned to this OB via ShopOrderbooker (companyId matches).
    // If the OB has no specific company assignments for a shop, fall back
    // to the shop's total balance (backward compatibility for legacy OBs).
    if (shops.length > 0) {
      try {
        const shopIds = shops.map((s) => s.shopId);
        const obBalanceRes = await pool.query(
          `SELECT
             scb."shopId",
             COALESCE(SUM(scb.balance), 0) AS "ob_balance"
           FROM "ShopCompanyBalance" scb
           WHERE scb."shopId" = ANY($1::text[])
             AND scb.balance > 0
             AND scb."companyId" IN (
               SELECT so."companyId"
               FROM "ShopOrderbooker" so
               WHERE so."orderbookerId" = $2
                 AND so."companyId" IS NOT NULL
               UNION
               SELECT uc."companyId"
               FROM "UserCompany" uc
               WHERE uc."userId" = $2
             )
           GROUP BY scb."shopId"`,
          [shopIds, effectiveOrderbookerId]
        );

        const obBalanceMap: Record<string, number> = {};
        for (const r of obBalanceRes.rows) {
          obBalanceMap[r.shopId] = Number(r.ob_balance);
        }

        // Override shopBalance with per-OB balance (if found), else keep total
        for (const shop of shops) {
          if (obBalanceMap[shop.shopId] !== undefined) {
            shop.shopBalance = Math.round(obBalanceMap[shop.shopId] * 100) / 100;
          }
          // If no per-OB balance found, keep the original shop.balance (total)
          // — this handles legacy OBs without company assignments.
        }
      } catch (e) {
        console.warn('[Recoveries] Per-OB balance query failed, using total balance:', e);
        // Non-fatal — shops already have shopBalance = total shop.balance
      }
    }

    return NextResponse.json({
      sessionId: session.id,
      orderbookerId: effectiveOrderbookerId,
      sessionStartTime: startTimeISO,
      sessionEndTime: session.endTime
        ? (session.endTime instanceof Date ? session.endTime.toISOString() : session.endTime)
        : null,
      sessionStatus: session.status,
      totalRecovery: Math.round(grandTotalRecovery * 100) / 100,
      totalPending: Math.round(grandTotalPending * 100) / 100,
      totalApproved: Math.round(grandTotalApproved * 100) / 100,
      totalRejected: Math.round(grandTotalRejected * 100) / 100,
      shopsCount: shops.length,
      shops,
    });
  } catch (error) {
    console.error('Error fetching route session recoveries:', error);
    return NextResponse.json({ error: 'Failed to fetch route session recoveries' }, { status: 500 });
  }
}
