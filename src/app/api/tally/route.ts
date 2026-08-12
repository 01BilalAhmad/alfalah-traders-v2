import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import {
  ensureTallyTables,
  insertNotification,
  DISCREPANCY_REASON_CODES,
  type DiscrepancyReasonCode,
} from '@/lib/tally-migrations';

interface ShopTallyRow {
  id: string;
  shopId: string;
  shopName: string;
  shopArea: string | null;
  talliedBy: string;
  tallyDate: string | Date;
  systemBalance: number;
  shopBalance: number;
  difference: number;
  status: string;
  notes: string | null;
  orderbookerId: string | null;
  orderbookerName: string | null;
  tellerName: string | null;
  tellerUsername: string | null;
  createdAt: string | Date;
  // New fields
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAddress: string | null;
  locationStatus: string;
  reasonCode: string | null;
  resolutionStatus: string;
  resolutionType: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | Date | null;
  voided: boolean;
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: string | Date | null;
  sessionId: string | null;
}

function formatRow(r: any): ShopTallyRow {
  return {
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
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    gpsLat: r.gpsLat != null ? Number(r.gpsLat) : null,
    gpsLng: r.gpsLng != null ? Number(r.gpsLng) : null,
    gpsAddress: r.gpsAddress ?? null,
    locationStatus: r.locationStatus ?? 'unverified',
    reasonCode: r.reasonCode ?? null,
    resolutionStatus: r.resolutionStatus ?? 'open',
    resolutionType: r.resolutionType ?? null,
    resolutionNote: r.resolutionNote ?? null,
    resolvedBy: r.resolvedBy ?? null,
    resolvedAt: r.resolvedAt instanceof Date ? r.resolvedAt.toISOString() : (r.resolvedAt ?? null),
    voided: Boolean(r.voided),
    voidReason: r.voidReason ?? null,
    voidedBy: r.voidedBy ?? null,
    voidedAt: r.voidedAt instanceof Date ? r.voidedAt.toISOString() : (r.voidedAt ?? null),
    sessionId: r.sessionId ?? null,
  };
}

// GET /api/tally — list tally records (filters: orderbookerId, tellerId, date range, status, shopId, resolutionStatus, voided)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const pool = getPool();
    await ensureTallyTables();

    const { searchParams } = new URL(request.url);
    const filterOBId = searchParams.get('orderbookerId');
    const filterTellerId = searchParams.get('tellerId');
    const filterShopId = searchParams.get('shopId');
    const filterStatus = searchParams.get('status');
    const filterResolution = searchParams.get('resolutionStatus');
    const filterVoided = searchParams.get('voided');
    const filterReasonCode = searchParams.get('reasonCode');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const todayOnly = searchParams.get('today') === 'true';
    const includeVoided = searchParams.get('includeVoided') === 'true';

    const isTeller = auth.user?.role === 'teller';
    const isAdmin = auth.user?.role === 'admin';
    if (!isTeller && !isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (isTeller) {
      const assignedObsRes = await pool.query(
        `SELECT "orderbookerId" FROM "TellerAssignment" WHERE "tellerId" = $1`,
        [auth.userId]
      );
      const assignedObIds = assignedObsRes.rows.map((r: any) => r.orderbookerId);
      if (assignedObIds.length > 0) {
        conditions.push(`(st."talliedBy" = $${idx} OR st."orderbookerId" = ANY($${idx + 1}::text[]))`);
        params.push(auth.userId, assignedObIds);
        idx += 2;
      } else {
        conditions.push(`st."talliedBy" = $${idx}`);
        params.push(auth.userId);
        idx++;
      }
    }

    // By default, hide voided tallies unless explicitly requested
    if (!includeVoided) {
      conditions.push(`(st."voided" IS NULL OR st."voided" = false)`);
    }

    if (filterOBId) {
      conditions.push(`st."orderbookerId" = $${idx++}`);
      params.push(filterOBId);
    }
    if (filterTellerId && isAdmin) {
      conditions.push(`st."talliedBy" = $${idx++}`);
      params.push(filterTellerId);
    }
    if (filterShopId) {
      conditions.push(`st."shopId" = $${idx++}`);
      params.push(filterShopId);
    }
    if (filterStatus && ['verified', 'discrepancy'].includes(filterStatus)) {
      conditions.push(`st."status" = $${idx++}`);
      params.push(filterStatus);
    }
    if (filterResolution && ['open', 'investigating', 'resolved'].includes(filterResolution)) {
      conditions.push(`st."resolutionStatus" = $${idx++}`);
      params.push(filterResolution);
    }
    if (filterVoided === 'true') {
      conditions.push(`st."voided" = true`);
    } else if (filterVoided === 'false') {
      conditions.push(`(st."voided" IS NULL OR st."voided" = false)`);
    }
    if (filterReasonCode && DISCREPANCY_REASON_CODES.includes(filterReasonCode as DiscrepancyReasonCode)) {
      conditions.push(`st."reasonCode" = $${idx++}`);
      params.push(filterReasonCode);
    }
    if (dateFrom) {
      conditions.push(`st."tallyDate" >= $${idx++}`);
      params.push(new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(`st."tallyDate" <= $${idx++}`);
      params.push(end.toISOString());
    }
    if (todayOnly) {
      const now = new Date();
      const pktMs = now.getTime() + 5 * 60 * 60 * 1000;
      const pktNow = new Date(pktMs);
      const y = pktNow.getUTCFullYear();
      const m = pktNow.getUTCMonth();
      const d = pktNow.getUTCDate();
      const start = new Date(Date.UTC(y, m, d, -5, 0, 0, 0));
      const end = new Date(Date.UTC(y, m, d, 18, 59, 59, 999));
      conditions.push(`st."tallyDate" >= $${idx++}`);
      params.push(start.toISOString());
      conditions.push(`st."tallyDate" <= $${idx++}`);
      params.push(end.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const queryText = `
      SELECT DISTINCT ON (st."shopId", DATE(st."tallyDate"))
             st.id, st."shopId", s.name AS "shopName", s.area AS "shopArea",
             st."talliedBy", st."tallyDate", st."systemBalance", st."shopBalance",
             st."difference", st.status, st.notes, st."orderbookerId",
             ob.name AS "orderbookerName",
             tu.name AS "tellerName", tu.username AS "tellerUsername",
             st."createdAt",
             st."gpsLat", st."gpsLng", st."gpsAddress", st."locationStatus",
             st."reasonCode", st."resolutionStatus", st."resolutionType",
             st."resolutionNote", st."resolvedBy", st."resolvedAt",
             st."voided", st."voidReason", st."voidedBy", st."voidedAt",
             st."sessionId"
      FROM "ShopTally" st
      LEFT JOIN "Shop" s ON st."shopId" = s.id
      LEFT JOIN "User" ob ON st."orderbookerId" = ob.id
      LEFT JOIN "User" tu ON st."talliedBy" = tu.id
      ${whereClause}
      ORDER BY st."shopId", DATE(st."tallyDate") DESC, st."tallyDate" DESC, st."createdAt" DESC
      LIMIT 500
    `;

    const res = await pool.query(queryText, params);
    const rows = res.rows.map(formatRow);

    const summary = {
      total: rows.length,
      verified: rows.filter((r) => r.status === 'verified').length,
      discrepancy: rows.filter((r) => r.status === 'discrepancy').length,
      totalDifference: rows.reduce((sum, r) => sum + (r.difference || 0), 0),
      openDiscrepancies: rows.filter((r) => r.status === 'discrepancy' && r.resolutionStatus === 'open').length,
      resolvedDiscrepancies: rows.filter((r) => r.resolutionStatus === 'resolved').length,
    };

    return NextResponse.json({ tallies: rows, summary });
  } catch (error) {
    console.error('[Tally API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch tally records' }, { status: 500 });
  }
}

// POST /api/tally — create a tally record
// Body: { shopId, shopBalance, notes?, gpsLat?, gpsLng?, gpsAddress?, reasonCode?, sessionId?, confirmZero? }
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const {
      shopId,
      shopBalance,
      notes,
      gpsLat,
      gpsLng,
      gpsAddress,
      reasonCode,
      sessionId,
      confirmZero,
      force,
    } = body;

    if (!shopId) {
      return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
    }
    if (shopBalance === undefined || shopBalance === null || isNaN(Number(shopBalance))) {
      return NextResponse.json({ error: 'Valid shop balance is required' }, { status: 400 });
    }

    // Validate reasonCode if provided
    let normalizedReasonCode: string | null = null;
    if (reasonCode) {
      if (!DISCREPANCY_REASON_CODES.includes(reasonCode as DiscrepancyReasonCode)) {
        return NextResponse.json({ error: `Invalid reasonCode. Valid: ${DISCREPANCY_REASON_CODES.join(', ')}` }, { status: 400 });
      }
      normalizedReasonCode = reasonCode;
    }

    // Validate GPS
    let normalizedGpsLat: number | null = null;
    let normalizedGpsLng: number | null = null;
    let locationStatus = 'unverified';
    if (gpsLat != null && gpsLng != null && !isNaN(Number(gpsLat)) && !isNaN(Number(gpsLng))) {
      normalizedGpsLat = Number(gpsLat);
      normalizedGpsLng = Number(gpsLng);
      locationStatus = 'verified';
    } else if (confirmZero) {
      // confirmZero allows recording tally without explicit GPS, marked as unverified
      locationStatus = 'unverified';
    }

    const pool = getPool();
    await ensureTallyTables();

    // Fetch shop
    const shopRes = await pool.query(
      `SELECT id, name, area, balance, "orderbookerId", status FROM "Shop" WHERE id = $1`,
      [shopId]
    );
    if (shopRes.rows.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }
    const shop = shopRes.rows[0];

    // Teller authorization
    if (isTeller) {
      const assignedRes = await pool.query(
        `SELECT 1 FROM "TellerAssignment"
         WHERE "tellerId" = $1 AND "orderbookerId" = $2
         LIMIT 1`,
        [auth.userId, shop.orderbookerId]
      );
      if (assignedRes.rows.length === 0) {
        return NextResponse.json({ error: 'You are not assigned to this shop\'s orderbooker' }, { status: 403 });
      }
    }

    // ─── Concurrent tally check (5-minute debounce) ─────────────
    // If a non-voided tally was recorded for this shop in the last 5 minutes
    // by another teller, warn the client (return 409 with prior tally info).
    // The client can re-submit with force=true to override.
    if (force !== true) {
      const recentTallyRes = await pool.query(
        `SELECT st.id, st."tallyDate", st."shopBalance", st."difference", st.status,
                tu.name AS "tellerName"
         FROM "ShopTally" st
         LEFT JOIN "User" tu ON st."talliedBy" = tu.id
         WHERE st."shopId" = $1
           AND (st."voided" IS NULL OR st."voided" = false)
           AND st."tallyDate" >= NOW() - INTERVAL '5 minutes'
         ORDER BY st."tallyDate" DESC
         LIMIT 1`,
        [shopId]
      );
      if (recentTallyRes.rows.length > 0) {
        const recent = recentTallyRes.rows[0];
        return NextResponse.json({
          error: 'concurrent_tally_warning',
          recentTally: {
            id: recent.id,
            tallyDate: recent.tallyDate instanceof Date ? recent.tallyDate.toISOString() : recent.tallyDate,
            shopBalance: Number(recent.shopBalance) || 0,
            difference: Number(recent.difference) || 0,
            status: recent.status,
            tellerName: recent.tellerName,
          },
          message: `A tally was already recorded for this shop ${Math.round((Date.now() - new Date(recent.tallyDate).getTime()) / 60000)} minute(s) ago by ${recent.tellerName || 'another teller'}. Submit anyway?`,
        }, { status: 409 });
      }
    }

    const systemBalance = Number(shop.balance) || 0;
    const reportedShopBalance = Number(shopBalance);
    const difference = Math.round((systemBalance - reportedShopBalance) * 100) / 100;
    const status = difference === 0 ? 'verified' : 'discrepancy';

    // If discrepancy, require reasonCode (enforced client-side too, but verify server-side)
    if (status === 'discrepancy' && !normalizedReasonCode) {
      return NextResponse.json({
        error: 'reasonCode required',
        message: 'A reason code is required when there is a discrepancy.',
      }, { status: 400 });
    }
    // If verified, clear any provided reasonCode (no discrepancy to explain)
    if (status === 'verified') {
      normalizedReasonCode = null;
    }

    const id = `tally_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    // Validate session ownership (if provided)
    let validSessionId: string | null = null;
    if (sessionId) {
      const sessRes = await pool.query(
        `SELECT id, "tellerId", status FROM "TellerSession" WHERE id = $1`,
        [sessionId]
      );
      if (sessRes.rows.length > 0) {
        const sess = sessRes.rows[0];
        if (sess.tellerId === auth.userId && sess.status === 'active') {
          validSessionId = sessionId;
        }
      }
    }

    const insRes = await pool.query(
      `INSERT INTO "ShopTally"
        (id, "shopId", "talliedBy", "tallyDate", "systemBalance", "shopBalance",
         "difference", "status", "notes", "orderbookerId", "createdAt",
         "gpsLat", "gpsLng", "gpsAddress", "locationStatus",
         "reasonCode", "resolutionStatus", "sessionId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        id,
        shopId,
        auth.userId,
        now,
        systemBalance,
        reportedShopBalance,
        difference,
        status,
        notes ? String(notes).slice(0, 1000) : null,
        shop.orderbookerId || null,
        now,
        normalizedGpsLat,
        normalizedGpsLng,
        gpsAddress ? String(gpsAddress).slice(0, 500) : null,
        locationStatus,
        normalizedReasonCode,
        status === 'verified' ? 'resolved' : 'open',
        validSessionId,
      ]
    );

    // Update session talliesCount if applicable
    if (validSessionId) {
      try {
        await pool.query(
          `UPDATE "TellerSession"
             SET "talliesCount" = "talliesCount" + 1,
                 "discrepanciesCount" = "discrepanciesCount" + ${status === 'discrepancy' ? 1 : 0}
           WHERE id = $1`,
          [validSessionId]
        );
      } catch { /* non-blocking */ }
    }

    // Audit log (best-effort)
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "newValue", description)
         VALUES ($1, 'create', 'shopTally', $2, $3, $4)`,
        [
          auditId,
          id,
          JSON.stringify({
            shopId, shopName: shop.name, systemBalance,
            shopBalance: reportedShopBalance, difference, status,
            reasonCode: normalizedReasonCode, locationStatus, sessionId: validSessionId,
          }),
          `Tally recorded for ${shop.name}: ${status}${status === 'discrepancy' ? ` (reason: ${normalizedReasonCode})` : ''} (diff ${difference})`,
        ]
      );
    } catch { /* non-blocking */ }

    // ─── Notification on discrepancy (admin + assigned OB) ───────
    if (status === 'discrepancy') {
      // Notify all admins
      await insertNotification({
        role: 'admin',
        type: 'tally_discrepancy',
        title: 'Tally Discrepancy Recorded',
        description: `${shop.name}: difference of ${difference.toLocaleString('en-PK', { minimumFractionDigits: 2 })} (reason: ${normalizedReasonCode})`,
        meta: {
          tallyId: id,
          shopId,
          shopName: shop.name,
          difference,
          reasonCode: normalizedReasonCode,
          tellerId: auth.userId,
          tellerName: auth.user?.name,
        },
        actionRoute: '/tally-report',
      });
      // Notify the OB who owns this shop
      if (shop.orderbookerId) {
        await insertNotification({
          userId: shop.orderbookerId,
          type: 'tally_discrepancy',
          title: 'Tally Discrepancy on Your Shop',
          description: `${shop.name}: difference of ${difference.toLocaleString('en-PK', { minimumFractionDigits: 2 })}. Please review.`,
          meta: {
            tallyId: id,
            shopId,
            shopName: shop.name,
            difference,
            reasonCode: normalizedReasonCode,
          },
          actionRoute: '/tally-report',
        });
      }
    }

    const inserted = insRes.rows[0];
    return NextResponse.json({
      id: inserted.id,
      shopId: inserted.shopId,
      shopName: shop.name,
      shopArea: shop.area,
      talliedBy: inserted.talliedBy,
      tallyDate: inserted.tallyDate instanceof Date ? inserted.tallyDate.toISOString() : inserted.tallyDate,
      systemBalance: Number(inserted.systemBalance) || 0,
      shopBalance: Number(inserted.shopBalance) || 0,
      difference: Number(inserted.difference) || 0,
      status: inserted.status,
      notes: inserted.notes,
      orderbookerId: inserted.orderbookerId,
      orderbookerName: null,
      tellerName: auth.user?.name || null,
      tellerUsername: auth.user?.username || null,
      createdAt: inserted.createdAt instanceof Date ? inserted.createdAt.toISOString() : inserted.createdAt,
      gpsLat: inserted.gpsLat != null ? Number(inserted.gpsLat) : null,
      gpsLng: inserted.gpsLng != null ? Number(inserted.gpsLng) : null,
      gpsAddress: inserted.gpsAddress,
      locationStatus: inserted.locationStatus,
      reasonCode: inserted.reasonCode,
      resolutionStatus: inserted.resolutionStatus,
      sessionId: inserted.sessionId,
    }, { status: 201 });
  } catch (error) {
    console.error('[Tally API] POST error:', error);
    return NextResponse.json({ error: 'Failed to create tally record' }, { status: 500 });
  }
}
