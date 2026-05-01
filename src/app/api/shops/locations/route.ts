import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// GET /api/shops/locations
// Returns shops with their latest GPS coordinates from ShopVisit table
export async function GET(request: NextRequest) {
  let client;
  try {
    client = getPgClient();
    await client.connect();

    // Get the latest visit for each shop that has GPS coordinates
    const res = await client.query(
      `SELECT DISTINCT ON (sv."shopId")
        sv."shopId",
        sv."gpsLat" AS lat,
        sv."gpsLng" AS lng,
        sv."gpsAddress",
        sv."inRange",
        sv."createdAt" AS "lastVisitAt",
        s.name AS "shopName",
        s."ownerName",
        s.area,
        s.balance,
        s.status,
        s."routeDay",
        u.name AS "orderbookerName"
       FROM "ShopVisit" sv
       INNER JOIN "Shop" s ON sv."shopId" = s.id
       LEFT JOIN "User" u ON sv."orderbookerId" = u.id
       WHERE sv."gpsLat" IS NOT NULL AND sv."gpsLng" IS NOT NULL
       ORDER BY sv."shopId", sv."createdAt" DESC`
    );

    const locations = res.rows.map((row: any) => ({
      shopId: row.shopId,
      shopName: row.shopName,
      ownerName: row.ownerName,
      area: row.area,
      balance: Number(row.balance),
      status: row.status,
      routeDay: row.routeDay,
      orderbookerName: row.orderbookerName,
      lat: Number(row.lat),
      lng: Number(row.lng),
      gpsAddress: row.gpsAddress,
      inRange: row.inRange,
      lastVisitAt: row.lastVisitAt instanceof Date ? row.lastVisitAt.toISOString() : row.lastVisitAt,
    }));

    await client.end();
    return NextResponse.json(locations);
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error fetching shop locations:', error);
    return NextResponse.json({ error: 'Failed to fetch shop locations' }, { status: 500 });
  }
}
