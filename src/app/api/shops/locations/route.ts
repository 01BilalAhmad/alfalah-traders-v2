import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/shops/locations
// Returns shops with their latest GPS coordinates from ShopVisit table,
// falling back to Transaction table (recovery entries with GPS) when no visit exists
export async function GET(request: NextRequest) {
  try {
    const pool = getPool();

    // Strategy:
    // 1. Get latest ShopVisit GPS coordinates per shop
    // 2. Get latest Transaction GPS coordinates per shop (for shops without visits)
    // 3. Combine them (visits take priority, transactions fill the gaps)

    const res = await pool.query(
      `WITH visit_locations AS (
        SELECT DISTINCT ON (sv."shopId")
          sv."shopId",
          sv."gpsLat" AS lat,
          sv."gpsLng" AS lng,
          sv."gpsAddress",
          sv."inRange",
          sv."createdAt" AS "lastVisitAt",
          'visit' AS source
        FROM "ShopVisit" sv
        WHERE sv."gpsLat" IS NOT NULL AND sv."gpsLng" IS NOT NULL
        ORDER BY sv."shopId", sv."createdAt" DESC
      ),
      transaction_locations AS (
        SELECT DISTINCT ON (t."shopId")
          t."shopId",
          t."gpsLat" AS lat,
          t."gpsLng" AS lng,
          t."gpsAddress",
          NULL::boolean AS "inRange",
          t."createdAt" AS "lastVisitAt",
          'transaction' AS source
        FROM "Transaction" t
        WHERE t."gpsLat" IS NOT NULL AND t."gpsLng" IS NOT NULL
          AND t.type = 'recovery'
          AND t.status IN ('approved', 'pending')
        ORDER BY t."shopId", t."createdAt" DESC
      ),
      combined AS (
        SELECT * FROM visit_locations
        UNION ALL
        SELECT tl.* FROM transaction_locations tl
        WHERE NOT EXISTS (
          SELECT 1 FROM visit_locations vl WHERE vl."shopId" = tl."shopId"
        )
      )
      SELECT
        c."shopId",
        c.lat,
        c.lng,
        c."gpsAddress",
        c."inRange",
        c."lastVisitAt",
        c.source,
        s.name AS "shopName",
        s."ownerName",
        s.area,
        s.balance,
        s.status,
        s."routeDays",
        u.name AS "orderbookerName"
      FROM combined c
      INNER JOIN "Shop" s ON c."shopId" = s.id
      LEFT JOIN "User" u ON s."orderbookerId" = u.id
      ORDER BY s.area, s.name`
    );

    const locations = res.rows.map((row: any) => ({
      shopId: row.shopId,
      shopName: row.shopName,
      ownerName: row.ownerName,
      area: row.area,
      balance: Number(row.balance),
      status: row.status,
      routeDays: row.routeDays || [],
      orderbookerName: row.orderbookerName,
      lat: Number(row.lat),
      lng: Number(row.lng),
      gpsAddress: row.gpsAddress,
      inRange: row.inRange,
      lastVisitAt: row.lastVisitAt instanceof Date ? row.lastVisitAt.toISOString() : row.lastVisitAt,
      source: row.source,
    }));

    return NextResponse.json(locations);
  } catch (error) {
    console.error('Error fetching shop locations:', error);
    return NextResponse.json({ error: 'Failed to fetch shop locations' }, { status: 500 });
  }
}
