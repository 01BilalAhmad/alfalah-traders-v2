import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';

const SHOP_PROXIMITY_RADIUS = 30; // meters

// Haversine distance formula in SQL (meters)
const HAVERSINE_SQL = `
  6371000 * 2 * ATAN2(
    SQRT(
      POWER(SIN(RADIANS($1 - lat) / 2), 2) +
      COS(RADIANS(lat)) * COS(RADIANS($1)) *
      POWER(SIN(RADIANS($2 - lng) / 2), 2)
    ),
    SQRT(1 - (
      POWER(SIN(RADIANS($1 - lat) / 2), 2) +
      COS(RADIANS(lat)) * COS(RADIANS($1)) *
      POWER(SIN(RADIANS($2 - lng) / 2), 2)
    ))
  )
`;

// POST /api/route-sessions/location
// Record a single GPS point + proximity detection.
// Body: { sessionId, lat, lng, accuracy?, speed?, batteryLevel?, isOffline? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, lat, lng, accuracy, speed, batteryLevel, isOffline } = body;

    if (!sessionId || lat == null || lng == null) {
      return NextResponse.json(
        { error: 'sessionId, lat, and lng are required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Verify session exists and is active
    const sessionRes = await pool.query(
      `SELECT id, "orderbookerId", status FROM "RouteSession" WHERE id = $1`,
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (sessionRes.rows[0].status !== 'active') {
      return NextResponse.json(
        { error: 'Session is not active' },
        { status: 400 }
      );
    }

    const orderbookerId = sessionRes.rows[0].orderbookerId;

    // Insert the location record
    await pool.query(
      `INSERT INTO "RouteLocation" ("sessionId", lat, lng, accuracy, speed, "batteryLevel", "isOffline", "recordedAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        sessionId,
        lat,
        lng,
        accuracy ?? null,
        speed ?? null,
        batteryLevel ?? null,
        isOffline ?? false,
      ]
    );

    // Shop proximity detection: find shops within 30m that the orderbooker is assigned to
    const nearbyRes = await pool.query(
      `SELECT id, name, lat AS "shopLat", lng AS "shopLng",
              ${HAVERSINE_SQL} AS distance
       FROM "Shop"
       WHERE "orderbookerId" = $3
         AND lat IS NOT NULL AND lng IS NOT NULL
         AND ${HAVERSINE_SQL} <= $4
       ORDER BY distance ASC
       LIMIT 1`,
      [lat, lng, orderbookerId, SHOP_PROXIMITY_RADIUS]
    );

    let shopProximity = null;

    if (nearbyRes.rows.length > 0) {
      const shop = nearbyRes.rows[0];
      const distance = Number(shop.distance);

      // Check if this shop has already been visited in this session
      const existingVisitRes = await pool.query(
        `SELECT id FROM "RouteShopVisit"
         WHERE "sessionId" = $1 AND "shopId" = $2`,
        [sessionId, shop.id]
      );

      if (existingVisitRes.rows.length === 0) {
        // Create a new shop visit
        const client = await getClient();
        try {
          await client.query('BEGIN');

          await client.query(
            `INSERT INTO "RouteShopVisit" ("sessionId", "shopId", "enterLat", "enterLng", "enterTime", "distanceToShop", "isAutoDetected", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, NOW(), $5, true, NOW(), NOW())`,
            [sessionId, shop.id, lat, lng, distance]
          );

          // Auto-populate Shop.lat/lng if not already set
          if (shop.shopLat == null || shop.shopLng == null) {
            await client.query(
              `UPDATE "Shop" SET lat = $1, lng = $2, "updatedAt" = NOW() WHERE id = $3 AND (lat IS NULL OR lng IS NULL)`,
              [lat, lng, shop.id]
            );
          }

          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }

      shopProximity = {
        shopId: shop.id,
        shopName: shop.name,
        distance,
      };
    } else {
      // Also check shops without lat/lng but that the orderbooker visits
      // This helps auto-populate shop coordinates on first visit detection
      // We skip this if no shops are nearby (no false positives)
    }

    return NextResponse.json({
      success: true,
      shopProximity,
    });
  } catch (error) {
    console.error('Error recording location:', error);
    return NextResponse.json(
      { error: 'Failed to record location' },
      { status: 500 }
    );
  }
}
