import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';
import crypto from 'crypto';

// Haversine distance in meters between two lat/lng points (TypeScript implementation)
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

// POST /api/route-sessions/location
// Record a GPS location and run proximity detection against assigned shops
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, lat, lng, accuracy, speed, altitude, batteryLevel, isOffline } = body;

    if (!sessionId || lat == null || lng == null) {
      return NextResponse.json(
        { error: 'sessionId, lat, and lng are required' },
        { status: 400 }
      );
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
    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Session is not active' }, { status: 409 });
    }

    const orderbookerId = session.orderbookerId;
    const now = new Date().toISOString();

    // Insert RouteLocation
    const locId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO "RouteLocation" (id, "sessionId", lat, lng, accuracy, speed, altitude, "batteryLevel", "isOffline", "recordedAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        locId,
        sessionId,
        lat,
        lng,
        accuracy ?? null,
        speed ?? null,
        altitude ?? null,
        batteryLevel ?? null,
        isOffline ?? false,
        now,
        now,
      ]
    );

    // ── Proximity Detection ─────────────────────────────────────────────
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

      const client = await getClient();
      try {
        await client.query('BEGIN');

        for (const shop of shopsRes.rows) {
          const shopLat = Number(shop.lat);
          const shopLng = Number(shop.lng);
          const distance = haversineMeters(lat, lng, shopLat, shopLng);
          const isNearby = distance <= PROXIMITY_RADIUS_M;

          if (isNearby) {
            // Entering or still within shop radius
            if (!openVisitShopIds.has(shop.id)) {
              // No open visit for this shop — create new RouteShopVisit (first visit or re-visit)
              const visitId = crypto.randomUUID();
              await client.query(
                `INSERT INTO "RouteShopVisit"
                 (id, "sessionId", "shopId", "orderbookerId", "enterLat", "enterLng", "enterTime", "distanceToShop", "isAutoDetected", "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [visitId, sessionId, shop.id, orderbookerId, lat, lng, now, Math.round(distance), true, now, now]
              );

              openVisitShopIds.add(shop.id);

              shopProximities.push({
                shopId: shop.id,
                shopName: shop.name,
                distance: Math.round(distance),
                action: 'entered',
              });
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
              // Was inside, now leaving — update the open visit
              const visitRes = await client.query(
                `SELECT id, "enterTime" FROM "RouteShopVisit"
                 WHERE "sessionId" = $1 AND "shopId" = $2 AND "exitTime" IS NULL`,
                [sessionId, shop.id]
              );

              if (visitRes.rows.length > 0) {
                const visit = visitRes.rows[0];
                const enterTime = new Date(visit.enterTime);
                const timeSpent = Math.round((new Date(now).getTime() - enterTime.getTime()) / 1000);

                await client.query(
                  `UPDATE "RouteShopVisit"
                   SET "exitTime" = $1, "exitLat" = $2, "exitLng" = $3, "timeSpent" = $4, "updatedAt" = $5
                   WHERE id = $6`,
                  [now, lat, lng, timeSpent, now, visit.id]
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

        // If Shop.lat is null for any nearby shop, batch-update from this GPS (avoids N+1)
        const enteredShopIds = shopProximities
          .filter((p: any) => p.action === 'entered')
          .map((p: any) => p.shopId);
        if (enteredShopIds.length > 0) {
          await client.query(
            `UPDATE "Shop" SET lat = $1, lng = $2, "updatedAt" = $3
             WHERE id = ANY($4::text[]) AND lat IS NULL`,
            [lat, lng, now, enteredShopIds]
          );
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    // Also check shops without lat/lng — if we're near them, we can't detect proximity
    // But if the orderbooker is at a shop without coordinates, update the shop's coordinates
    // This is handled above when action === 'entered'

    return NextResponse.json({
      success: true,
      shopProximity: shopProximities.length > 0 ? shopProximities[0] : null,
      allProximities: shopProximities,
    });
  } catch (error) {
    console.error('Error recording route location:', error);
    return NextResponse.json({ error: 'Failed to record route location' }, { status: 500 });
  }
}
