import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/route-tracking/routes
// Get all routes (for admin panel)
// Query params: orderbookerId?, date?, companyId?, status?
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const date = searchParams.get('date'); // YYYY-MM-DD
    const companyId = searchParams.get('companyId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const pool = getPool();

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (orderbookerId) {
      conditions.push(`rt."orderbookerId" = $${paramIndex++}`);
      params.push(orderbookerId);
    }

    if (companyId) {
      conditions.push(`rt."companyId" = $${paramIndex++}`);
      params.push(companyId);
    }

    if (status) {
      conditions.push(`rt.status = $${paramIndex++}`);
      params.push(status);
    }

    if (date) {
      // Filter by Pakistan timezone day (UTC+5)
      const [year, month, day] = date.split('-').map(Number);
      const startDate = new Date(Date.UTC(year, month - 1, day, -5, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));
      conditions.push(`rt."startTime" >= $${paramIndex++}`);
      params.push(startDate.toISOString());
      conditions.push(`rt."startTime" <= $${paramIndex++}`);
      params.push(endDate.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total routes
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM "RouteTracking" rt ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    // Fetch routes with orderbooker name
    // Try with stop/waypoint counts first; if tables don't exist, fall back to simple query
    const offset = (page - 1) * limit;
    let routesRes;

    try {
      routesRes = await pool.query(
        `SELECT rt.*,
                u.name AS "orderbookerName",
                COALESCE(stop_counts.stop_count, 0) AS "stopsCount",
                COALESCE(waypoint_counts.waypoint_count, 0) AS "waypointsCount"
         FROM "RouteTracking" rt
         LEFT JOIN "User" u ON rt."orderbookerId" = u.id
         LEFT JOIN (
           SELECT "routeId", COUNT(*) AS stop_count
           FROM "RouteStop"
           GROUP BY "routeId"
         ) stop_counts ON rt.id = stop_counts."routeId"
         LEFT JOIN (
           SELECT "routeId", COUNT(*) AS waypoint_count
           FROM "RouteWaypoint"
           GROUP BY "routeId"
         ) waypoint_counts ON rt.id = waypoint_counts."routeId"
         ${whereClause}
         ORDER BY rt."startTime" DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      );
    } catch (joinError: unknown) {
      // RouteStop or RouteWaypoint tables may not exist yet — fall back to simpler query
      const joinMsg = joinError instanceof Error ? joinError.message : '';
      console.warn('[Routes] Join query failed, using simple query:', joinMsg);

      routesRes = await pool.query(
        `SELECT rt.*, u.name AS "orderbookerName"
         FROM "RouteTracking" rt
         LEFT JOIN "User" u ON rt."orderbookerId" = u.id
         ${whereClause}
         ORDER BY rt."startTime" DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      );

      // Add default counts
      for (const row of routesRes.rows) {
        row.stopsCount = '0';
        row.waypointsCount = '0';
      }
    }

    // Fetch first few waypoints for each route (for map preview)
    const routeIds = routesRes.rows.map((r: Record<string, unknown>) => r.id);
    let previewWaypoints: Record<string, unknown[]> = {};

    if (routeIds.length > 0) {
      try {
        const wpRes = await pool.query(
          `SELECT "routeId", lat, lng, "timestamp"
           FROM "RouteWaypoint"
           WHERE "routeId" = ANY($1)
           ORDER BY "routeId", "timestamp" ASC`,
          [routeIds]
        );

        // Group waypoints by routeId and take first 20 per route for preview
        const grouped: Record<string, unknown[]> = {};
        for (const wp of wpRes.rows) {
          const rid = wp.routeId as string;
          if (!grouped[rid]) grouped[rid] = [];
          if (grouped[rid].length < 20) {
            grouped[rid].push({
              lat: Number(wp.lat),
              lng: Number(wp.lng),
              timestamp: wp.timestamp instanceof Date ? wp.timestamp.toISOString() : wp.timestamp,
            });
          }
        }
        previewWaypoints = grouped;
      } catch (wpError: unknown) {
        // RouteWaypoint table may not exist yet
        const wpMsg = wpError instanceof Error ? wpError.message : '';
        console.warn('[Routes] Could not fetch preview waypoints:', wpMsg);
      }
    }

    const routes = routesRes.rows.map((r: Record<string, unknown>) => {
      // Compute totalDistance from preview waypoints for approximate distance
      const pwp = previewWaypoints[r.id as string] || [];
      let totalDistance = 0;

      // Use totalDistance from DB if available (calculated at route end)
      if (r.totalDistance != null && Number(r.totalDistance) > 0) {
        totalDistance = Number(r.totalDistance);
      } else if (pwp.length >= 2) {
        for (let i = 1; i < pwp.length; i++) {
          const prev = pwp[i - 1] as { lat: number; lng: number };
          const curr = pwp[i] as { lat: number; lng: number };
          totalDistance += haversine(prev.lat, prev.lng, curr.lat, curr.lng);
        }
        // Scale up: preview has only first 20 waypoints, approximate full distance
        const wpCount = parseInt(r.waypointsCount as string, 10) || 0;
        if (wpCount > 20 && pwp.length >= 2) {
          totalDistance = totalDistance * (wpCount / pwp.length);
        }
      } else if (r.startLat != null && r.endLat != null) {
        // Fallback: straight-line distance from start to end
        totalDistance = haversine(Number(r.startLat), Number(r.startLng), Number(r.endLat), Number(r.endLng));
      }

      const totalDistanceKm = Math.round(totalDistance / 1000 * 100) / 100;

      // Convert totalDuration from seconds to minutes for frontend display
      const totalDurationMinutes = r.totalDuration != null ? Math.round(Number(r.totalDuration) / 60) : null;

      // Derive routeDate from startTime (Pakistan timezone)
      let routeDate = '';
      try {
        const startDate = r.startTime instanceof Date ? r.startTime : new Date(r.startTime as string);
        routeDate = startDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }); // YYYY-MM-DD
      } catch {
        routeDate = (r.startTime instanceof Date ? r.startTime.toISOString() : String(r.startTime)).split('T')[0];
      }

      return {
        id: r.id,
        orderbookerId: r.orderbookerId,
        orderbookerName: r.orderbookerName,
        companyId: r.companyId,
        routeDate,
        status: r.status,
        startLat: r.startLat != null ? Number(r.startLat) : null,
        startLng: r.startLng != null ? Number(r.startLng) : null,
        endLat: r.endLat != null ? Number(r.endLat) : null,
        endLng: r.endLng != null ? Number(r.endLng) : null,
        startTime: r.startTime instanceof Date ? (r.startTime as Date).toISOString() : r.startTime,
        endTime: r.endTime instanceof Date ? (r.endTime as Date).toISOString() : r.endTime,
        totalDistance: totalDistanceKm,
        totalDuration: totalDurationMinutes,
        stopsCount: parseInt(r.stopsCount as string, 10) || 0,
        waypointsCount: parseInt(r.waypointsCount as string, 10) || 0,
        previewWaypoints: pwp,
      };
    });

    return NextResponse.json({
      routes,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching routes:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Haversine distance between two lat/lng points (returns meters)
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
