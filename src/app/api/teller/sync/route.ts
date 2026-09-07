import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { ensureTallyTables } from '@/lib/tally-migrations';
import { getOverdueShops, OVERDUE_THRESHOLD_DAYS } from '@/lib/overdue';

// GET /api/teller/sync — ONE bulk endpoint for teller app
// Returns everything the teller app needs in a SINGLE network round-trip:
//   - valid (token validation)
//   - user (id, name, role)
//   - shops (with routeDays + lastTally + orderbookerName + FIFO overdue fields)
//   - tallies (today's tallies by this teller)
//   - session (active session if any)
//   - notifications (last 50)
//   - businessName
//   - overdueSummary (count + totals for the red banner)
//
// v2 overdue fields per shop (same FIFO logic as the web Overdue page):
//   - overdueAmount — unpaid portion of bills 14+ days old
//   - daysSinceCredit — days since OLDEST unpaid bill (FIFO age)
//   - oldestUnpaidCreditDate — ISO date of the oldest unpaid bill
//   - unpaidBills — top 5 oldest unpaid bills { date, amount, remaining, daysOld }
//   - unpaidBillCount — total unpaid bills
//   - isOverdue — oldest unpaid bill is 14+ days old
//
// This replaces 7 separate API calls → 1 call → 3-5x faster sync.
// Mirrors the pattern of /api/mobile/sync (OB app) but scoped for tellers.
//
// Teller authorization:
//   - Teller sees only shops assigned via TellerAssignment (tellerId → orderbookerId)
//   - Teller sees only their own tallies + sessions
//   - Notifications: matched by userId OR role='teller'
//   - Admin can also call (sees their own data — not very useful but harmless)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const isTeller = auth.user?.role === 'teller';
    const isAdmin = auth.user?.role === 'admin';
    if (!isTeller && !isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const pool = getPool();
    await ensureTallyTables();

    const tellerId = auth.userId;

    // ─── 1. Get assigned OBs ─────────────────────────────────────
    const assignedRes = await pool.query(
      `SELECT "orderbookerId" FROM "TellerAssignment" WHERE "tellerId" = $1`,
      [tellerId]
    );
    const obIds = assignedRes.rows.map((r: any) => r.orderbookerId);

    // ─── 2. Get shops (with routeDays + lastTally + OB name) ──────
    // Single query — uses LATERAL for lastTally (much faster than per-shop subqueries)
    let shops: any[] = [];
    if (obIds.length > 0) {
      const shopsRes = await pool.query(
        `SELECT s.id, s.name, s.area, s.address, s.phone, s."ownerName",
                s.balance, s."orderbookerId", s."routeDays", s.status,
                u.name AS "orderbookerName", u.username AS "orderbookerUsername",
                lt."tallyDate" AS "lastTallyDate",
                lt.status AS "lastTallyStatus",
                lt.difference AS "lastTallyDifference",
                lt2.name AS "lastTallyTellerName"
         FROM "Shop" s
         LEFT JOIN "User" u ON s."orderbookerId" = u.id
         LEFT JOIN LATERAL (
           SELECT st."tallyDate", st.status, st.difference, st."talliedBy"
           FROM "ShopTally" st
           WHERE st."shopId" = s.id
             AND (st."voided" IS NULL OR st."voided" = false)
           ORDER BY st."tallyDate" DESC
           LIMIT 1
         ) lt ON true
         LEFT JOIN LATERAL (
           SELECT name FROM "User" WHERE id = lt."talliedBy" LIMIT 1
         ) lt2 ON true
         WHERE s.status = 'active'
           AND s."orderbookerId" = ANY($1::text[])
         ORDER BY s.name ASC
         LIMIT 1000`,
        [obIds]
      );

      shops = shopsRes.rows.map((s: any) => ({
        id: s.id,
        name: s.name,
        area: s.area,
        address: s.address,
        phone: s.phone,
        ownerName: s.ownerName,
        balance: Number(s.balance) || 0,
        orderbookerId: s.orderbookerId,
        orderbookerName: s.orderbookerName,
        orderbookerUsername: s.orderbookerUsername,
        routeDays: Array.isArray(s.routeDays) ? s.routeDays : [],
        status: s.status,
        companyBalances: [], // Will be filled below
        lastTally: s.lastTallyDate ? {
          tallyDate: s.lastTallyDate instanceof Date ? s.lastTallyDate.toISOString() : s.lastTallyDate,
          status: s.lastTallyStatus,
          difference: Number(s.lastTallyDifference) || 0,
          talliedByName: s.lastTallyTellerName || null,
        } : null,
      }));

      // Fetch company balances for all shops in one query
      if (shops.length > 0) {
        const shopIds = shops.map(s => s.id);
        const scbRes = await pool.query(
          `SELECT scb."shopId", scb."companyId", c.name AS "companyName", scb.balance
           FROM "ShopCompanyBalance" scb
           LEFT JOIN "Company" c ON scb."companyId" = c.id
           WHERE scb."shopId" = ANY($1::text[])`,
          [shopIds]
        );
        const scbMap = new Map<string, any[]>();
        for (const row of scbRes.rows) {
          if (!scbMap.has(row.shopId)) scbMap.set(row.shopId, []);
          scbMap.get(row.shopId)!.push({
            companyId: row.companyId,
            companyName: row.companyName || row.companyId,
            balance: Number(row.balance) || 0,
          });
        }
        for (const shop of shops) {
          shop.companyBalances = scbMap.get(shop.id) || [];
        }
      }
    }

    // ─── 2.5 FIFO overdue fields (v2 — same logic as web Overdue page) ──
    // Merges per-shop overdue data into the shops array + builds overdueSummary
    // for the teller app's red dashboard banner, "Overdue" filter chip and
    // per-shop unpaid-bills breakdown (dates + amounts).
    let overdueSummary = {
      count: 0,
      threshold: OVERDUE_THRESHOLD_DAYS,
      totalOutstanding: 0,
      totalOverdue: 0,
    };
    if (shops.length > 0) {
      try {
        const fifoShops = await getOverdueShops({
          includeNonOverdue: true,
          minDays: 0,
          limit: 2000,
        });
        const fifoMap = new Map(fifoShops.map((s) => [s.shopId, s]));
        let overdueCount = 0;
        let totalOutstanding = 0;
        let totalOverdue = 0;
        for (const shop of shops) {
          const f = fifoMap.get(shop.id);
          if (f) {
            // FIFO diverged from ledger (claims) → ledger balance is authoritative
            shop.overdueAmount = f.fifoMatchesShopBalance
              ? f.overdueAmount
              : f.totalBalance;
            shop.daysSinceCredit = f.daysOverdue;
            shop.oldestUnpaidCreditDate = f.oldestUnpaidCreditDate;
            shop.fifoMatchesShopBalance = f.fifoMatchesShopBalance;
            shop.isOverdue =
              f.daysOverdue >= OVERDUE_THRESHOLD_DAYS && shop.overdueAmount > 0;
            shop.unpaidBillCount = f.unpaidBills.length;
            shop.unpaidBills = f.unpaidBills.slice(0, 5).map((b) => ({
              date: b.date ? new Date(b.date).toISOString() : null,
              amount: b.amount,
              remaining: b.remaining,
              daysOld: b.daysOld,
              companyId: b.companyId ?? null,
            }));
          } else {
            // No unpaid bills per FIFO (balance 0 or fully covered) — clean shop
            shop.overdueAmount = 0;
            shop.daysSinceCredit = 0;
            shop.oldestUnpaidCreditDate = null;
            shop.fifoMatchesShopBalance = true;
            shop.isOverdue = false;
            shop.unpaidBillCount = 0;
            shop.unpaidBills = [];
          }
          if (shop.isOverdue) {
            overdueCount++;
            totalOutstanding += shop.balance;
            totalOverdue += shop.overdueAmount;
          }
        }
        overdueSummary = {
          count: overdueCount,
          threshold: OVERDUE_THRESHOLD_DAYS,
          totalOutstanding,
          totalOverdue,
        };
      } catch (e) {
        // Overdue computation must never break the whole sync
        console.error('[Teller Sync API] overdue computation failed:', e);
      }
    }

    // ─── 3. Get today's tallies by this teller ────────────────────
    // PKT day window: midnight to midnight (UTC-5 to UTC+19 = PKT 00:00 to 23:59)
    const now = new Date();
    const pktMs = now.getTime() + 5 * 60 * 60 * 1000;
    const pktNow = new Date(pktMs);
    const y = pktNow.getUTCFullYear();
    const m = pktNow.getUTCMonth();
    const d = pktNow.getUTCDate();
    const startOfDay = new Date(Date.UTC(y, m, d, -5, 0, 0, 0));     // PKT 00:00
    const endOfDay = new Date(Date.UTC(y, m, d, 18, 59, 59, 999));   // PKT 23:59

    const talliesRes = await pool.query(
      `SELECT st.id, st."shopId", st."talliedBy", st."tallyDate",
              st."systemBalance", st."shopBalance", st."difference",
              st.status, st.notes, st."orderbookerId",
              st."gpsLat", st."gpsLng", st."gpsAddress", st."locationStatus",
              st."reasonCode", st."resolutionStatus", st."resolutionType",
              st."resolutionNote", st."resolvedBy", st."resolvedAt",
              st."voided", st."voidReason", st."voidedBy", st."voidedAt",
              st."sessionId", st."createdAt",
              s.name AS "shopName", s.area AS "shopArea",
              ob.name AS "orderbookerName",
              tu.name AS "tellerName", tu.username AS "tellerUsername"
       FROM "ShopTally" st
       LEFT JOIN "Shop" s ON st."shopId" = s.id
       LEFT JOIN "User" ob ON st."orderbookerId" = ob.id
       LEFT JOIN "User" tu ON st."talliedBy" = tu.id
       WHERE st."talliedBy" = $1
         AND st."tallyDate" >= $2
         AND st."tallyDate" <= $3
       ORDER BY st."tallyDate" DESC, st."createdAt" DESC
       LIMIT 500`,
      [tellerId, startOfDay.toISOString(), endOfDay.toISOString()]
    );

    const tallies = talliesRes.rows.map((r: any) => ({
      id: r.id,
      shopId: r.shopId,
      shopName: r.shopName,
      shopArea: r.shopArea,
      talliedBy: r.talliedBy,
      tallyDate: r.tallyDate instanceof Date ? r.tallyDate.toISOString() : r.tallyDate,
      systemBalance: Number(r.systemBalance) || 0,
      shopBalance: Number(r.shopBalance) || 0,
      difference: Number(r.difference) || 0,
      status: r.status,
      notes: r.notes,
      orderbookerId: r.orderbookerId,
      orderbookerName: r.orderbookerName,
      tellerName: r.tellerName,
      tellerUsername: r.tellerUsername,
      gpsLat: r.gpsLat != null ? Number(r.gpsLat) : null,
      gpsLng: r.gpsLng != null ? Number(r.gpsLng) : null,
      gpsAddress: r.gpsAddress,
      locationStatus: r.locationStatus ?? 'unverified',
      reasonCode: r.reasonCode,
      resolutionStatus: r.resolutionStatus ?? 'open',
      resolutionType: r.resolutionType,
      resolutionNote: r.resolutionNote,
      resolvedBy: r.resolvedBy,
      resolvedAt: r.resolvedAt instanceof Date ? r.resolvedAt.toISOString() : r.resolvedAt,
      voided: Boolean(r.voided),
      voidReason: r.voidReason,
      voidedBy: r.voidedBy,
      voidedAt: r.voidedAt instanceof Date ? r.voidedAt.toISOString() : r.voidedAt,
      sessionId: r.sessionId,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));

    // ─── 4. Get active session (if any) ──────────────────────────
    const sessionRes = await pool.query(
      `SELECT id, "tellerId", "startTime", "endTime",
              "startGpsLat", "startGpsLng", "startGpsAddress",
              "endGpsLat", "endGpsLng", "endGpsAddress",
              area, notes, "talliesCount", "discrepanciesCount",
              status, "createdAt"
       FROM "TellerSession"
       WHERE "tellerId" = $1 AND status = 'active'
       LIMIT 1`,
      [tellerId]
    );

    let session: any = null;
    if (sessionRes.rows.length > 0) {
      const s = sessionRes.rows[0];
      session = {
        id: s.id,
        tellerId: s.tellerId,
        startTime: s.startTime instanceof Date ? s.startTime.toISOString() : s.startTime,
        endTime: s.endTime instanceof Date ? s.endTime.toISOString() : s.endTime,
        startGpsLat: s.startGpsLat != null ? Number(s.startGpsLat) : null,
        startGpsLng: s.startGpsLng != null ? Number(s.startGpsLng) : null,
        startGpsAddress: s.startGpsAddress,
        endGpsLat: s.endGpsLat != null ? Number(s.endGpsLat) : null,
        endGpsLng: s.endGpsLng != null ? Number(s.endGpsLng) : null,
        endGpsAddress: s.endGpsAddress,
        area: s.area,
        notes: s.notes,
        talliesCount: s.talliesCount,
        discrepanciesCount: s.discrepanciesCount,
        status: s.status,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      };
    }

    // ─── 5. Get notifications ────────────────────────────────────
    let notifications: any[] = [];
    try {
      const notifRes = await pool.query(
        `SELECT id, "userId", role, type, title, description, meta, read,
                "readAt", "actionRoute", "createdAt"
         FROM "Notification"
         WHERE ("userId" = $1 OR role = $2)
         ORDER BY read ASC, "createdAt" DESC
         LIMIT 50`,
        [tellerId, auth.user?.role || 'teller']
      );
      notifications = notifRes.rows.map((n: any) => ({
        id: n.id,
        userId: n.userId,
        role: n.role,
        type: n.type,
        title: n.title,
        description: n.description,
        meta: typeof n.meta === 'string' ? JSON.parse(n.meta) : n.meta,
        read: Boolean(n.read),
        readAt: n.readAt instanceof Date ? n.readAt.toISOString() : n.readAt,
        actionRoute: n.actionRoute,
        createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
      }));
    } catch {
      // Notification table may not exist yet — non-fatal
    }

    // ─── 6. Get business name ────────────────────────────────────
    let businessName = 'AL-FALAH TRADERS';
    try {
      const configRes = await pool.query(
        `SELECT value FROM "SystemConfig" WHERE key = 'businessName' LIMIT 1`
      );
      if (configRes.rows.length > 0) businessName = configRes.rows[0].value;
    } catch {
      // SystemConfig may not exist — use default
    }

    // ─── 7. Summary ──────────────────────────────────────────────
    const verifiedCount = tallies.filter((t) => t.status === 'verified' || t.status === 'matched').length;
    const discrepancyCount = tallies.filter((t) => t.status === 'discrepancy').length;

    return NextResponse.json({
      valid: true,
      user: {
        id: auth.userId,
        name: auth.user?.name,
        username: auth.user?.username,
        role: auth.user?.role,
        phone: auth.user?.phone,
        status: auth.user?.status,
      },
      shops,
      tallies,
      session,
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      businessName,
      overdueSummary,
      v2: true,
      summary: {
        total: tallies.length,
        verified: verifiedCount,
        discrepancy: discrepancyCount,
      },
      syncTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Teller Sync API] error:', error);
    return NextResponse.json({ error: 'Failed to sync teller data' }, { status: 500 });
  }
}
