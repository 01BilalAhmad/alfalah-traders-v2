import { NextRequest, NextResponse } from 'next/server';
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

// GET /api/tally/shops — list shops available for tally
// - admin: all shops (optionally filtered by orderbookerId)
// - teller: only shops belonging to their assigned OBs
// Includes last tally info per shop
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
    await ensureTables(pool);

    const { searchParams } = new URL(request.url);
    const filterOBId = searchParams.get('orderbookerId');

    let obFilterIds: string[] | null = null;

    if (isTeller) {
      // Restrict to assigned OBs
      const assignedRes = await pool.query(
        `SELECT "orderbookerId" FROM "TellerAssignment" WHERE "tellerId" = $1`,
        [auth.userId]
      );
      const assignedIds = assignedRes.rows.map((r: any) => r.orderbookerId);
      if (assignedIds.length === 0) {
        return NextResponse.json({ shops: [] });
      }
      // If teller passes ?orderbookerId=xxx, ensure it's in their assigned set
      if (filterOBId && !assignedIds.includes(filterOBId)) {
        return NextResponse.json({ shops: [] });
      }
      obFilterIds = filterOBId ? [filterOBId] : assignedIds;
    } else if (isAdmin && filterOBId) {
      obFilterIds = [filterOBId];
    }

    // Build shop query
  const shopQueryParams: any[] = [];
  let shopWhere = `WHERE s.status = 'active'`;
  if (obFilterIds && obFilterIds.length > 0) {
    shopWhere += ` AND s."orderbookerId" = ANY($1::text[])`;
    shopQueryParams.push(obFilterIds);
  }

  const shopsRes = await pool.query(
    `SELECT s.id, s.name, s.area, s.address, s.phone, s."ownerName",
            s.balance, s."orderbookerId", s.status,
            u.name AS "orderbookerName", u.username AS "orderbookerUsername"
     FROM "Shop" s
     LEFT JOIN "User" u ON s."orderbookerId" = u.id
     ${shopWhere}
     ORDER BY s.name ASC
     LIMIT 1000`,
    shopQueryParams
  );

  // Fetch last tally per shop (most recent tally for each shopId in our result set)
  const shopIds = shopsRes.rows.map((r: any) => r.id);
  let lastTallyMap: Record<string, { tallyDate: string; status: string; difference: number; talliedByName: string | null }> = {};

  if (shopIds.length > 0) {
    const lastTallyRes = await pool.query(
      `SELECT DISTINCT ON (st."shopId")
              st."shopId", st."tallyDate", st.status, st.difference,
              tu.name AS "talliedByName"
       FROM "ShopTally" st
       LEFT JOIN "User" tu ON st."talliedBy" = tu.id
       WHERE st."shopId" = ANY($1::text[])
       ORDER BY st."shopId", st."tallyDate" DESC`,
      [shopIds]
    );
    for (const row of lastTallyRes.rows) {
      lastTallyMap[row.shopId] = {
        tallyDate: row.tallyDate instanceof Date ? row.tallyDate.toISOString() : row.tallyDate,
        status: row.status,
        difference: Number(row.difference) || 0,
        talliedByName: row.talliedByName || null,
      };
    }
  }

  const shops = shopsRes.rows.map((s: any) => ({
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
    status: s.status,
    lastTally: lastTallyMap[s.id] || null,
  }));

  return NextResponse.json({ shops });
  } catch (error) {
    console.error('[Tally Shops API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch shops for tally' }, { status: 500 });
  }
}
