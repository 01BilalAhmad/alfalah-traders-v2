import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/route-tracking/live
// Returns all currently active (ongoing) routes with:
// - Latest GPS position (from most recent waypoint)
// - Orderbooker info
// - Which shop they're near (if any)
// - Route duration so far
export async function GET(request: NextRequest) {
  try {
    const pool = getPool();

    // 1. Get all ongoing routes with orderbooker name
    const routesRes = await pool.query(
      `SELECT rt.id, rt."orderbookerId", rt."startLat", rt."startLng", rt."startTime", rt."companyId",
              u.name AS "orderbookerName", u.phone AS "orderbookerPhone"
       FROM "RouteTracking" rt
       LEFT JOIN "User" u ON rt."orderbookerId" = u.id
       WHERE rt.status = 'ongoing'
       ORDER BY rt."startTime" DESC`
    );

    if (routesRes.rows.length === 0) {
      return NextResponse.json({ orderbookers: [], count: 0 });
    }

    // 2. For each ongoing route, get the latest waypoint (most recent GPS position)
    const results = [];

    for (const route of routesRes.rows) {
      let latestLat = Number(route.startLat);
      let latestLng = Number(route.startLng);
      let latestTime = route.startTime;
      let waypointsCount = 0;

      try {
        const wpRes = await pool.query(
          `SELECT lat, lng, "timestamp"
           FROM "RouteWaypoint"
           WHERE "routeId" = $1
           ORDER BY "timestamp" DESC
           LIMIT 1`,
          [route.id]
        );

        if (wpRes.rows.length > 0) {
          latestLat = Number(wpRes.rows[0].lat);
          latestLng = Number(wpRes.rows[0].lng);
          latestTime = wpRes.rows[0].timestamp;
        }

        // Get total waypoints count for this route
        const countRes = await pool.query(
          `SELECT COUNT(*)::INTEGER AS cnt FROM "RouteWaypoint" WHERE "routeId" = $1`,
          [route.id]
        );
        waypointsCount = countRes.rows[0]?.cnt || 0;
      } catch {
        // Waypoints table might not exist yet — use start position
      }

      // 3. Check if orderbooker is near any shop (within 100 meters)
      let nearShop: { id: string; name: string; area: string | null; distance: number } | null = null;
      try {
        const shopRes = await pool.query(
          `SELECT s.id, s.name, s.area,
                  (6371000 * 2 * ASIN(SQRT(
                    POWER(SIN((RADIANS(s.lat) - RADIANS($1)) / 2), 2) +
                    COS(RADIANS($1)) * COS(RADIANS(s.lat)) *
                    POWER(SIN((RADIANS(s.lng) - RADIANS($2)) / 2), 2)
                  ))) AS distance_meters
           FROM "Shop" s
           WHERE s.lat IS NOT NULL AND s.lng IS NOT NULL
           ORDER BY distance_meters ASC
           LIMIT 1`,
          [latestLat, latestLng]
        );

        if (shopRes.rows.length > 0 && Number(shopRes.rows[0].distance_meters) <= 100) {
          nearShop = {
            id: shopRes.rows[0].id,
            name: shopRes.rows[0].name,
            area: shopRes.rows[0].area,
            distance: Math.round(Number(shopRes.rows[0].distance_meters)),
          };
        }
      } catch {
        // Shop table might not have lat/lng columns
      }

      // 4. Get last 50 waypoints for drawing the route path
      let pathPoints: { lat: number; lng: number; timestamp: string }[] = [];
      try {
        const pathRes = await pool.query(
          `SELECT lat, lng, "timestamp"
           FROM "RouteWaypoint"
           WHERE "routeId" = $1
           ORDER BY "timestamp" ASC
           LIMIT 500`,
          [route.id]
        );
        pathPoints = pathRes.rows.map((r: any) => ({
          lat: Number(r.lat),
          lng: Number(r.lng),
          timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
        }));
      } catch {
        // ignore
      }

      // Calculate duration
      const startTime = new Date(route.startTime);
      const durationMs = Date.now() - startTime.getTime();
      const durationMins = Math.floor(durationMs / 60000);
      const durationHours = Math.floor(durationMins / 60);
      const durationStr = durationHours > 0
        ? `${durationHours}h ${durationMins % 60}m`
        : `${durationMins}m`;

      results.push({
        routeId: route.id,
        orderbookerId: route.orderbookerId,
        orderbookerName: route.orderbookerName || route.orderbookerId,
        orderbookerPhone: route.orderbookerPhone || null,
        companyId: route.companyId,
        startTime: route.startTime instanceof Date ? route.startTime.toISOString() : route.startTime,
        duration: durationStr,
        durationMinutes: durationMins,
        currentLat: latestLat,
        currentLng: latestLng,
        lastUpdated: latestTime instanceof Date ? latestTime.toISOString() : latestTime,
        waypointsCount,
        nearShop,
        pathPoints,
      });
    }

    return NextResponse.json({
      orderbookers: results,
      count: results.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RouteTracking/Live] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
