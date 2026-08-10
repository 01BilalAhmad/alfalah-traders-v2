import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';

// ─── Ensure ShopTally + TellerAssignment tables exist ────────────
async function ensureTables(pool: any) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "ShopTally" (
      "id" TEXT NOT NULL,
      "shopId" TEXT NOT NULL,
      "talliedBy" TEXT NOT NULL,
      "tallyDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "systemBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "shopBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "difference" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'verified',
      "notes" TEXT,
      "orderbookerId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ShopTally_pkey" PRIMARY KEY ("id")
    );
  `);
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_shopId_idx" ON "ShopTally"("shopId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_talliedBy_idx" ON "ShopTally"("talliedBy")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_orderbookerId_idx" ON "ShopTally"("orderbookerId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_tallyDate_idx" ON "ShopTally"("tallyDate")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ShopTally_status_idx" ON "ShopTally"("status")`);
  } catch { /* ignore */ }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "TellerAssignment" (
      "id" TEXT NOT NULL,
      "tellerId" TEXT NOT NULL,
      "orderbookerId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TellerAssignment_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "TellerAssignment_tellerId_orderbookerId_key" UNIQUE ("tellerId", "orderbookerId")
    );
  `);
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS "TellerAssignment_tellerId_idx" ON "TellerAssignment"("tellerId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "TellerAssignment_orderbookerId_idx" ON "TellerAssignment"("orderbookerId")`);
  } catch { /* ignore */ }
}

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
  };
}

// GET /api/tally — list tally records (filters: orderbookerId, tellerId, date range, status, shopId)
// - admin sees all
// - teller sees only their own records AND only their assigned OBs' shops
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const pool = getPool();
    await ensureTables(pool);

    const { searchParams } = new URL(request.url);
    const filterOBId = searchParams.get('orderbookerId');
    const filterTellerId = searchParams.get('tellerId');
    const filterShopId = searchParams.get('shopId');
    const filterStatus = searchParams.get('status');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const todayOnly = searchParams.get('today') === 'true';

    const isTeller = auth.user?.role === 'teller';
    const isAdmin = auth.user?.role === 'admin';
    if (!isTeller && !isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (isTeller) {
      // Restrict to teller's own records AND only shops of assigned OBs
      const assignedObsRes = await pool.query(
        `SELECT "orderbookerId" FROM "TellerAssignment" WHERE "tellerId" = $1`,
        [auth.userId]
      );
      const assignedObIds = assignedObsRes.rows.map((r: any) => r.orderbookerId);

      // Teller sees their own tallies OR tallies for shops of their assigned OBs
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
      // Pakistan timezone (UTC+5) start/end of day
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
      SELECT st.id, st."shopId", s.name AS "shopName", s.area AS "shopArea",
             st."talliedBy", st."tallyDate", st."systemBalance", st."shopBalance",
             st."difference", st.status, st.notes, st."orderbookerId",
             ob.name AS "orderbookerName",
             tu.name AS "tellerName", tu.username AS "tellerUsername",
             st."createdAt"
      FROM "ShopTally" st
      LEFT JOIN "Shop" s ON st."shopId" = s.id
      LEFT JOIN "User" ob ON st."orderbookerId" = ob.id
      LEFT JOIN "User" tu ON st."talliedBy" = tu.id
      ${whereClause}
      ORDER BY st."tallyDate" DESC, st."createdAt" DESC
      LIMIT 500
    `;

    const res = await pool.query(queryText, params);

    // Compute summary
    const rows = res.rows.map(formatRow);
    const summary = {
      total: rows.length,
      verified: rows.filter((r) => r.status === 'verified').length,
      discrepancy: rows.filter((r) => r.status === 'discrepancy').length,
      totalDifference: rows.reduce((sum, r) => sum + (r.difference || 0), 0),
    };

    return NextResponse.json({ tallies: rows, summary });
  } catch (error) {
    console.error('[Tally API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch tally records' }, { status: 500 });
  }
}

// POST /api/tally — create a tally record
// Body: { shopId, shopBalance, notes? }
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
    const { shopId, shopBalance, notes } = body;

    if (!shopId) {
      return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
    }
    if (shopBalance === undefined || shopBalance === null || isNaN(Number(shopBalance))) {
      return NextResponse.json({ error: 'Valid shop balance is required' }, { status: 400 });
    }

    const pool = getPool();
    await ensureTables(pool);

    // Fetch the shop (with its current balance + orderbookerId)
    const shopRes = await pool.query(
      `SELECT id, name, area, balance, "orderbookerId", status FROM "Shop" WHERE id = $1`,
      [shopId]
    );
    if (shopRes.rows.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }
    const shop = shopRes.rows[0];

    // If teller, verify the shop belongs to one of their assigned OBs
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

    const systemBalance = Number(shop.balance) || 0;
    const reportedShopBalance = Number(shopBalance);
    const difference = Math.round((systemBalance - reportedShopBalance) * 100) / 100;
    const status = difference === 0 ? 'verified' : 'discrepancy';

    const id = `tally_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    const insRes = await pool.query(
      `INSERT INTO "ShopTally" (id, "shopId", "talliedBy", "tallyDate", "systemBalance", "shopBalance", "difference", "status", "notes", "orderbookerId", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
      ]
    );

    // Audit log (best-effort)
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "newValue", description)
         VALUES ($1, 'create', 'shopTally', $2, $3, $4)`,
        [
          auditId,
          id,
          JSON.stringify({ shopId, shopName: shop.name, systemBalance, shopBalance: reportedShopBalance, difference, status }),
          `Tally recorded for ${shop.name}: ${status} (diff ${difference})`,
        ]
      );
    } catch { /* non-blocking */ }

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
    }, { status: 201 });
  } catch (error) {
    console.error('[Tally API] POST error:', error);
    return NextResponse.json({ error: 'Failed to create tally record' }, { status: 500 });
  }
}
