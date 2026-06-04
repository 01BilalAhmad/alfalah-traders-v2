import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';

const SHOP_PROXIMITY_RADIUS = 30; // meters

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

// POST /api/route-sessions/locations-batch
// Batch upload GPS points. Proximity check runs only on the LAST point.
// Body: { sessionId, locations: [{ lat, lng, accuracy?, speed?, recordedAt, isOffline? }] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, locations } = body;

    if (!sessionId || !Array.isArray(locations) || locations.length === 0) {
      return NextResponse.json(
        { error: 'sessionId and a non-empty locations array are required' },
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

    // Insert all locations using a transaction for batch efficiency
    const client = await getClient();
    try {
      await client.query('BEGIN');

      for (const loc of locations) {
        const recordedAt = loc.recordedAt
          ? new Date(loc.recordedAt).toISOString()
          : new Date().toISOString();

        await client.query(
          `INSERT INTO "RouteLocation" ("sessionId", lat, lng, accuracy, speed, "batteryLevel", "isOffline", "recordedAt", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            sessionId,
            loc.lat,
            loc.lng,
            loc.accuracy ?? null,
            loc.speed ?? null,
            loc.batteryLevel ?? null,
            loc.isOffline ?? false,
            recordedAt,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Proximity check on the LAST point only
    const lastPoint = locations[locations.length - 1];
    let shopProximity = null;

    if (lastPoint.lat != null && lastPoint.lng != null) {
      const nearbyRes = await pool.query(
        `SELECT id, name, lat AS "shopLat", lng AS "shopLng",
                ${HAVERSINE_SQL} AS distance
         FROM "Shop"
         WHERE "orderbookerId" = $3
           AND lat IS NOT NULL AND lng IS NOT NULL
           AND ${HAVERSINE_SQL} <= $4
         ORDER BY distance ASC
         LIMIT 1`,
        [lastPoint.lat, lastPoint.lng, orderbookerId, SHOP_PROXIMITY_RADIUS]
      );

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
          const visitClient = await getClient();
          try {
            await visitClient.query('BEGIN');

            await visitClient.query(
              `INSERT INTO "RouteShopVisit" ("sessionId", "shopId", "enterLat", "enterLng", "enterTime", "distanceToShop", "isAutoDetected", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, NOW(), $5, true, NOW(), NOW())`,
              [sessionId, shop.id, lastPoint.lat, lastPoint.lng, distance]
            );

            // Auto-populate Shop.lat/lng if not already set
            if (shop.shopLat == null || shop.shopLng == null) {
              await visitClient.query(
                `UPDATE "Shop" SET lat = $1, lng = $2, "updatedAt" = NOW() WHERE id = $3 AND (lat IS NULL OR lng IS NULL)`,
                [lastPoint.lat, lastPoint.lng, shop.id]
              );
            }

            await visitClient.query('COMMIT');
          } catch (err) {
            await visitClient.query('ROLLBACK');
            throw err;
          } finally {
            visitClient.release();
          }
        }

        shopProximity = {
          shopId: shop.id,
          shopName: shop.name,
          distance,
        };
      }
    }

    return NextResponse.json({
      success: true,
      count: locations.length,
      shopProximity,
    });
  } catch (error) {
    console.error('Error batch recording locations:', error);
    return NextResponse.json(
      { error: 'Failed to batch record locations' },
      { status: 500 }
    );
  }
}
