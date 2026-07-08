import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import crypto from 'crypto';

// POST /api/shops/:id/visits - Record a GPS-verified shop visit
// Also updates Shop.lat/lng from visit GPS coordinates and creates RouteShopVisit
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shopId } = await params;
    const { orderbookerId, gpsLat, gpsLng, gpsAddress, inRange } = await request.json();

    if (!shopId || !orderbookerId) {
      return NextResponse.json({ error: 'shopId and orderbookerId are required' }, { status: 400 });
    }

    const pool = getPool();

    // Verify shop exists
    const shopRes = await pool.query('SELECT id, name, lat, lng FROM "Shop" WHERE id = $1', [shopId]);
    if (shopRes.rows.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const shop = shopRes.rows[0];

    // ── Duplicate visit prevention ────────────────────────────────
    // If this orderbooker already recorded a visit for this shop TODAY,
    // return the existing visit instead of creating a duplicate.
    // This prevents double-pins on the admin map when recovery is submitted
    // online (creating a visit) and then synced again offline (creating another).
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const existingVisitRes = await pool.query(
        `SELECT * FROM "ShopVisit"
         WHERE "shopId" = $1
           AND "orderbookerId" = $2
           AND "createdAt" >= $3
           AND "createdAt" <= $4
         ORDER BY "createdAt" DESC
         LIMIT 1`,
        [shopId, orderbookerId, todayStart.toISOString(), todayEnd.toISOString()]
      );

      if (existingVisitRes.rows.length > 0) {
        // Already visited today — return existing visit (no duplicate)
        const existing = existingVisitRes.rows[0];
        console.log(`[ShopVisit] Duplicate visit prevented: shop=${shopId}, OB=${orderbookerId}, existing visit=${existing.id}`);
        return NextResponse.json({
          ...existing,
          gpsLat: existing.gpsLat ? Number(existing.gpsLat) : null,
          gpsLng: existing.gpsLng ? Number(existing.gpsLng) : null,
          _duplicate_prevented: true,
        }, { status: 200 });
      }
    } catch (dupErr) {
      console.error('[ShopVisit] Duplicate check failed:', dupErr);
      // Non-blocking — continue with visit creation
    }

    const visitId = `visit_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
    const visitRes = await pool.query(
      `INSERT INTO "ShopVisit" (id, "shopId", "orderbookerId", "gpsLat", "gpsLng", "gpsAddress", "inRange", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [visitId, shopId, orderbookerId, gpsLat || null, gpsLng || null, gpsAddress || null, inRange !== false]
    );

    const visit = visitRes.rows[0];

    // Update Shop.lat/lng from visit GPS coordinates if shop doesn't have them yet
    // This ensures shops appear on the map after their first visit
    if (gpsLat && gpsLng && (!shop.lat || !shop.lng)) {
      try {
        await pool.query(
          `UPDATE "Shop" SET lat = $1, lng = $2, "updatedAt" = NOW() WHERE id = $3 AND (lat IS NULL OR lng IS NULL)`,
          [gpsLat, gpsLng, shopId]
        );
        console.log(`[ShopVisit] Updated Shop ${shopId} GPS coordinates from visit: ${gpsLat}, ${gpsLng}`);
      } catch (updateErr) {
        console.warn('[ShopVisit] Failed to update shop GPS coordinates:', updateErr);
        // Non-critical — visit is still recorded
      }
    }

    // Create a RouteShopVisit if there's a route session for this orderbooker
    // Check for active sessions first, then recently-ended sessions (sync may happen after route end)
    // This ensures manual visits show up in the website's route tracker
    if (gpsLat && gpsLng) {
      try {
        // First try active session
        let sessionRes = await pool.query(
          `SELECT id FROM "RouteSession" WHERE "orderbookerId" = $1 AND status = 'active' ORDER BY "startTime" DESC LIMIT 1`,
          [orderbookerId]
        );

        // If no active session, check for a session that ended today (for late sync uploads)
        if (sessionRes.rows.length === 0) {
          sessionRes = await pool.query(
            `SELECT id FROM "RouteSession" 
             WHERE "orderbookerId" = $1 
               AND status IN ('ended', 'auto_ended') 
               AND "startTime" >= CURRENT_DATE 
             ORDER BY "startTime" DESC LIMIT 1`,
            [orderbookerId]
          );
        }

        if (sessionRes.rows.length > 0) {
          const sessionId = sessionRes.rows[0].id;

          // Check if a RouteShopVisit already exists for this session + shop (avoid duplicates)
          const existingVisit = await pool.query(
            `SELECT id FROM "RouteShopVisit" WHERE "sessionId" = $1 AND "shopId" = $2`,
            [sessionId, shopId]
          );

          if (existingVisit.rows.length === 0) {
            const routeVisitId = `rsv_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
            const now = new Date();

            // Calculate distance to shop if shop has coordinates
            let distanceToShop: number | null = null;
            if (shop.lat && shop.lng) {
              const R = 6371000; // Earth radius in meters
              const dLat = (gpsLat - shop.lat) * Math.PI / 180;
              const dLng = (gpsLng - shop.lng) * Math.PI / 180;
              const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                        Math.cos(shop.lat * Math.PI / 180) * Math.cos(gpsLat * Math.PI / 180) *
                        Math.sin(dLng / 2) * Math.sin(dLng / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              distanceToShop = Math.round(R * c);
            }

            await pool.query(
              `INSERT INTO "RouteShopVisit" (id, "sessionId", "shopId", "orderbookerId", "enterLat", "enterLng", "enterTime", "exitTime", "timeSpent", "distanceToShop", "isAutoDetected", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
              [
                routeVisitId,
                sessionId,
                shopId,
                orderbookerId,
                gpsLat,
                gpsLng,
                now.toISOString(),     // enterTime = now
                now.toISOString(),     // exitTime = now (manual visit is instant)
                0,                     // timeSpent = 0 (manual visit)
                distanceToShop,
                false,                 // isAutoDetected = false (manual visit)
              ]
            );
            console.log(`[ShopVisit] Created RouteShopVisit for session ${sessionId}, shop ${shopId}`);
          }
        }
      } catch (routeVisitErr) {
        console.warn('[ShopVisit] Failed to create RouteShopVisit:', routeVisitErr);
        // Non-critical — ShopVisit is still recorded
      }
    }

    return NextResponse.json({
      id: visit.id,
      shopId: visit.shopId,
      orderbookerId: visit.orderbookerId,
      gpsLat: visit.gpsLat,
      gpsLng: visit.gpsLng,
      gpsAddress: visit.gpsAddress,
      inRange: visit.inRange,
      createdAt: visit.createdAt instanceof Date ? visit.createdAt.toISOString() : visit.createdAt,
    }, { status: 201 });
  } catch (error) {
    console.error('Error recording shop visit:', error);
    return NextResponse.json({ error: 'Failed to record visit' }, { status: 500 });
  }
}

// GET /api/shops/:id/visits - Get visits for a shop
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shopId } = await params;
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // YYYY-MM-DD
    const orderbookerId = searchParams.get('orderbookerId');
    const limit = parseInt(searchParams.get('limit') || '50');

    const pool = getPool();

    const conditions: string[] = [`v."shopId" = $1`];
    const sqlParams: any[] = [shopId];
    let paramIndex = 2;

    if (orderbookerId) {
      conditions.push(`v."orderbookerId" = $${paramIndex++}`);
      sqlParams.push(orderbookerId);
    }

    if (date) {
      // Filter by Pakistan timezone day
      const [year, month, day] = date.split('-').map(Number);
      const start = new Date(Date.UTC(year, month - 1, day, -5, 0, 0, 0));
      const end = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));
      conditions.push(`v."createdAt" >= $${paramIndex++}`);
      sqlParams.push(start.toISOString());
      conditions.push(`v."createdAt" <= $${paramIndex++}`);
      sqlParams.push(end.toISOString());
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const visitsRes = await pool.query(
      `SELECT v.*, u.name AS "orderbookerName"
       FROM "ShopVisit" v
       LEFT JOIN "User" u ON v."orderbookerId" = u.id
       ${whereClause}
       ORDER BY v."createdAt" DESC
       LIMIT $${paramIndex++}`,
      [...sqlParams, limit]
    );

    const visits = visitsRes.rows.map((v: any) => ({
      id: v.id,
      shopId: v.shopId,
      orderbookerId: v.orderbookerId,
      orderbookerName: v.orderbookerName,
      gpsLat: v.gpsLat,
      gpsLng: v.gpsLng,
      gpsAddress: v.gpsAddress,
      inRange: v.inRange,
      createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
    }));

    return NextResponse.json(visits);
  } catch (error) {
    console.error('Error fetching shop visits:', error);
    return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 });
  }
}
