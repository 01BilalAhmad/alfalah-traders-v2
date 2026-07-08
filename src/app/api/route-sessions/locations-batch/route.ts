import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';
import crypto from 'crypto';

// Haversine distance in meters between two lat/lng points
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const PROXIMITY_RADIUS_M = 30;

interface ShopProximity {
  shopId: string;
  shopName: string;
  distance: number;
  action: 'entered' | 'exited' | 'nearby' | null;
}

// POST /api/route-sessions/locations-batch
// Bulk insert GPS locations and run proximity detection on the last point
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, locations } = body;

    if (!sessionId || !locations || !Array.isArray(locations) || locations.length === 0) {
      return NextResponse.json(
        { error: 'sessionId and a non-empty locations array are required' },
        { status: 400 }
      );
    }

    // Limit batch size to prevent oversized queries
    if (locations.length > 500) {
      return NextResponse.json(
        { error: 'Batch size exceeds maximum of 500 locations' },
        { status: 400 }
      );
    }

    // Validate each location has required fields
    for (let i = 0; i < locations.length; i++) {
      if (locations[i].lat == null || locations[i].lng == null) {
        return NextResponse.json(
          { error: `Location at index ${i} is missing lat or lng` },
          { status: 400 }
        );
      }
    }

    const pool = getPool();

    // Verify session exists and is active
    const sessionRes = await pool.query(
      'SELECT id, "orderbookerId", status FROM "RouteSession" WHERE id = $1',
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const session = sessionRes.rows[0];
    if (session.status !== 'active' && session.status !== 'ended' && session.status !== 'auto_ended') {
      return NextResponse.json({ error: 'Session is not in a valid state for location upload' }, { status: 409 });
    }

    const orderbookerId = session.orderbookerId;
    const now = new Date().toISOString();

    // ── Bulk insert RouteLocation rows using VALUES clause ────────────────
    // Columns: id, "sessionId", lat, lng, accuracy, speed, altitude,
    //          "batteryLevel", "isOffline", "recordedAt", "createdAt"  (11 params per row)
    const valuesClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const loc of locations) {
      const locId = crypto.randomUUID();
      const recordedAt = loc.recordedAt || now;
      const isOffline = loc.isOffline ?? false;

      valuesClauses.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10})`
      );

      params.push(
        locId,          // id
        sessionId,      // sessionId
        loc.lat,        // lat
        loc.lng,        // lng
        loc.accuracy ?? null,   // accuracy
        loc.speed ?? null,      // speed
        loc.altitude ?? null,   // altitude
        loc.batteryLevel ?? null, // batteryLevel
        isOffline,      // isOffline
        recordedAt,     // recordedAt
        now             // createdAt
      );

      paramIdx += 11;
    }

    // Use transaction for bulk insert + proximity detection
    const client = await getClient();
    let saved = 0;

    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO "RouteLocation" (id, "sessionId", lat, lng, accuracy, speed, altitude, "batteryLevel", "isOffline", "recordedAt", "createdAt")
         VALUES ${valuesClauses.join(', ')}`,
        params
      );
      saved = locations.length;
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      throw error;
    }

    // ── Proximity Detection on LAST point only ──────────────────────────
    const lastLoc = locations[locations.length - 1];
    const lastLat = lastLoc.lat;
    const lastLng = lastLoc.lng;

    // Get all shops assigned to this orderbooker that have lat/lng
    const shopsRes = await pool.query(
      `SELECT DISTINCT s.id, s.name, s.lat, s.lng
       FROM "Shop" s
       WHERE s.status = 'active'
         AND s.lat IS NOT NULL AND s.lng IS NOT NULL
         AND (
           s."orderbookerId" = $1
           OR EXISTS (
             SELECT 1 FROM "ShopOrderbooker" so
             WHERE so."shopId" = s.id AND so."orderbookerId" = $1
           )
         )`,
      [orderbookerId]
    );

    const shopProximities: ShopProximity[] = [];

    if (shopsRes.rows.length > 0) {
      // Get currently open shop visits for this session
      const openVisitsRes = await pool.query(
        `SELECT "shopId" FROM "RouteShopVisit"
         WHERE "sessionId" = $1 AND "exitTime" IS NULL`,
        [sessionId]
      );
      const openVisitShopIds = new Set(openVisitsRes.rows.map((r: { shopId: string }) => r.shopId));

      try {
        // Transaction already started above for the bulk insert
        for (const shop of shopsRes.rows) {
          const shopLat = Number(shop.lat);
          const shopLng = Number(shop.lng);
          const distance = haversineMeters(lastLat, lastLng, shopLat, shopLng);
          const isNearby = distance <= PROXIMITY_RADIUS_M;

          if (isNearby) {
            if (!openVisitShopIds.has(shop.id)) {
              // No open visit — create new RouteShopVisit (first visit or re-visit)
              const visitId = crypto.randomUUID();
              const enterTime = lastLoc.recordedAt || now;

              await client.query(
                `INSERT INTO "RouteShopVisit"
                 (id, "sessionId", "shopId", "orderbookerId", "enterLat", "enterLng", "enterTime", "distanceToShop", "isAutoDetected", "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [visitId, sessionId, shop.id, orderbookerId, lastLat, lastLng, enterTime, Math.round(distance), true, now, now]
              );

              openVisitShopIds.add(shop.id);

              shopProximities.push({
                shopId: shop.id,
                shopName: shop.name,
                distance: Math.round(distance),
                action: 'entered',
              });

              // If Shop.lat is null, update from this GPS
              await client.query(
                `UPDATE "Shop" SET lat = $1, lng = $2, "updatedAt" = $3
                 WHERE id = $4 AND lat IS NULL`,
                [lastLat, lastLng, now, shop.id]
              );
            } else {
              // Already inside (open visit exists) — just report nearby
              shopProximities.push({
                shopId: shop.id,
                shopName: shop.name,
                distance: Math.round(distance),
                action: 'nearby',
              });
            }
          } else {
            // Outside shop radius
            if (openVisitShopIds.has(shop.id)) {
              // Was inside, now leaving
              const visitRes = await client.query(
                `SELECT id, "enterTime" FROM "RouteShopVisit"
                 WHERE "sessionId" = $1 AND "shopId" = $2 AND "exitTime" IS NULL`,
                [sessionId, shop.id]
              );

              if (visitRes.rows.length > 0) {
                const visit = visitRes.rows[0];
                const enterTime = new Date(visit.enterTime);
                const exitTime = lastLoc.recordedAt || now;
                const timeSpent = Math.round((new Date(exitTime).getTime() - enterTime.getTime()) / 1000);

                await client.query(
                  `UPDATE "RouteShopVisit"
                   SET "exitTime" = $1, "exitLat" = $2, "exitLng" = $3, "timeSpent" = $4, "updatedAt" = $5
                   WHERE id = $6`,
                  [exitTime, lastLat, lastLng, timeSpent, now, visit.id]
                );

                openVisitShopIds.delete(shop.id);

                shopProximities.push({
                  shopId: shop.id,
                  shopName: shop.name,
                  distance: Math.round(distance),
                  action: 'exited',
                });
              }
            }
          }
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else {
      // No shops to check — commit the bulk insert transaction
      try {
        await client.query('COMMIT');
      } catch {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }

    return NextResponse.json({
      saved,
      shopProximity: shopProximities,
    });
  } catch (error) {
    console.error('Error batch recording route locations:', error);
    return NextResponse.json({ error: 'Failed to batch record route locations' }, { status: 500 });
  }
}
