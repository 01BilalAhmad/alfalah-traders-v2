import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';
import crypto from 'crypto';
import { verifyToken } from '@/lib/jwt';

// Helper: Validate Bearer token from mobile app (supports JWT and legacy format)
function validateBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const verified = verifyToken(token);

  if (!verified.valid) return null;

  return verified.userId;
}

// POST /api/orderbooker/sync/upload
// Mobile app sync upload — accepts recoveries, shop visits, waypoint logs from the mobile app
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const userId = validateBearerToken(authHeader);

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 },
      );
    }

    const pool = getPool();

    // Verify user exists and is active
    const userCheck = await pool.query(
      'SELECT id, role, status FROM "User" WHERE id = $1',
      [userId],
    );

    if (userCheck.rows.length === 0 || userCheck.rows[0].status === 'inactive') {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { recoveries = [], shop_visits = [], waypoint_logs = [] } = body;

    const client = await getClient();
    const results = { recoveries: 0, visits: 0, waypoints: 0, errors: [] as any[] };

    try {
      // ── 1. Process Recoveries (Transactions) ──────────────────────
      for (const recovery of recoveries) {
        try {
          await client.query('BEGIN');

          const txId = `tx_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
          const now = new Date().toISOString();

          // Idempotency check
          if (recovery.localId) {
            const existingRes = await client.query(
              'SELECT id FROM "Transaction" WHERE "idempotencyKey" = $1',
              [`mobile_${recovery.localId}`],
            );
            if (existingRes.rows.length > 0) {
              await client.query('ROLLBACK');
              continue; // Skip duplicate
            }
          }

          // Get shop info
          const shopRes = await client.query(
            'SELECT balance, status, "orderbookerId" FROM "Shop" WHERE id = $1',
            [recovery.shopId],
          );
          if (shopRes.rows.length === 0) {
            await client.query('ROLLBACK');
            results.errors.push({ type: 'recovery', localId: recovery.localId, error: 'Shop not found' });
            continue;
          }

          const shopBalance = Number(shopRes.rows[0].balance);

          // Determine companyId
          let effectiveCompanyId = recovery.companyId || null;
          if (!effectiveCompanyId) {
            try {
              const scbRes = await client.query(
                'SELECT "companyId" FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND balance > 0 ORDER BY balance DESC LIMIT 1',
                [recovery.shopId],
              );
              if (scbRes.rows.length > 0) effectiveCompanyId = scbRes.rows[0].companyId;
            } catch { /* non-blocking */ }

            if (!effectiveCompanyId) {
              try {
                const obRes = await client.query('SELECT "companyId" FROM "User" WHERE id = $1', [userId]);
                if (obRes.rows.length > 0 && obRes.rows[0].companyId) {
                  effectiveCompanyId = obRes.rows[0].companyId;
                }
              } catch { /* non-blocking */ }
            }
          }

          // Recovery transactions need admin approval — don't change balance yet
          const txRes = await client.query(
            `INSERT INTO "Transaction" (id, "shopId", type, status, amount, "previousBalance", "newBalance",
              description, "createdBy", "companyId", "idempotencyKey", "gpsLat", "gpsLng", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING id`,
            [
              txId,
              recovery.shopId,
              'recovery',
              'pending',
              recovery.amount,
              shopBalance,
              shopBalance, // Balance doesn't change until approved
              recovery.note || `Mobile recovery - ${recovery.paymentMethod}`,
              userId,
              effectiveCompanyId || null,
              recovery.localId ? `mobile_${recovery.localId}` : null,
              recovery.latitude || null,
              recovery.longitude || null,
              now,
              now,
            ],
          );

          await client.query('COMMIT');
          results.recoveries++;
        } catch (err: any) {
          try { await client.query('ROLLBACK'); } catch {}
          results.errors.push({ type: 'recovery', localId: recovery.localId, error: err.message });
        }
      }

      // ── 2. Process Shop Visits ───────────────────────────────────
      for (const visit of shop_visits) {
        try {
          await client.query('BEGIN');
          const now = new Date().toISOString();
          const visitId = `visit_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

          // Check if ShopVisit table exists and insert
          try {
            await client.query(
              `INSERT INTO "ShopVisit" (id, "shopId", "orderbookerId", "enterTime", "exitTime", "timeSpent",
                "latitude", "longitude", "recoveryAmount", "recoveryMethod", "smsSent", "whatsappSent",
                "routeDate", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
              [
                visitId,
                visit.shopId,
                userId,
                visit.enterTime || now,
                visit.exitTime || null,
                visit.timeSpent || null,
                visit.latitude || null,
                visit.longitude || null,
                visit.recoveryAmount || 0,
                visit.recoveryMethod || null,
                visit.smsSent || false,
                visit.whatsappSent || false,
                visit.routeDate || now.split('T')[0],
                now,
                now,
              ],
            );
            results.visits++;
          } catch (visitErr: any) {
            // ShopVisit table might not exist — create it if needed
            if (visitErr.message?.includes('does not exist') || visitErr.message?.includes('not found')) {
              try {
                await client.query(`
                  CREATE TABLE IF NOT EXISTS "ShopVisit" (
                    id TEXT PRIMARY KEY,
                    "shopId" TEXT NOT NULL REFERENCES "Shop"(id),
                    "orderbookerId" TEXT NOT NULL REFERENCES "User"(id),
                    "enterTime" TIMESTAMPTZ NOT NULL,
                    "exitTime" TIMESTAMPTZ,
                    "timeSpent" INTEGER,
                    "latitude" DOUBLE PRECISION,
                    "longitude" DOUBLE PRECISION,
                    "recoveryAmount" NUMERIC DEFAULT 0,
                    "recoveryMethod" TEXT,
                    "smsSent" BOOLEAN DEFAULT false,
                    "whatsappSent" BOOLEAN DEFAULT false,
                    "routeDate" DATE,
                    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
                    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
                  )
                `);
                // Retry insert
                await client.query(
                  `INSERT INTO "ShopVisit" (id, "shopId", "orderbookerId", "enterTime", "exitTime", "timeSpent",
                    "latitude", "longitude", "recoveryAmount", "recoveryMethod", "smsSent", "whatsappSent",
                    "routeDate", "createdAt", "updatedAt")
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
                  [
                    visitId,
                    visit.shopId,
                    userId,
                    visit.enterTime || now,
                    visit.exitTime || null,
                    visit.timeSpent || null,
                    visit.latitude || null,
                    visit.longitude || null,
                    visit.recoveryAmount || 0,
                    visit.recoveryMethod || null,
                    visit.smsSent || false,
                    visit.whatsappSent || false,
                    visit.routeDate || now.split('T')[0],
                    now,
                    now,
                  ],
                );
                results.visits++;
              } catch (createErr) {
                // Could not create table or insert — skip silently
              }
            }
          }

          await client.query('COMMIT');
        } catch (err: any) {
          try { await client.query('ROLLBACK'); } catch {}
          results.errors.push({ type: 'visit', localId: visit.id, error: err.message });
        }
      }

      // ── 3. Process Waypoint Logs ─────────────────────────────────
      for (const waypoint of waypoint_logs) {
        try {
          await client.query('BEGIN');
          const now = new Date().toISOString();

          // Try to insert into RouteLocation (the actual table used by the route tracker)
          try {
            const locId = `loc_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
            const sessionId = waypoint.routeSessionId || waypoint.sessionId || null;
            
            // If sessionId is provided and exists in RouteSession, use it
            if (sessionId) {
              await client.query(
                `INSERT INTO "RouteLocation" (id, "sessionId", lat, lng, accuracy, speed, altitude, "batteryLevel", "isOffline", "recordedAt", "createdAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                  locId,
                  sessionId,
                  waypoint.latitude || waypoint.lat,
                  waypoint.longitude || waypoint.lng,
                  waypoint.accuracy || 0,
                  waypoint.speed || null,
                  waypoint.altitude || null,
                  waypoint.batteryLevel || null,
                  waypoint.isOffline ?? true,
                  waypoint.timestamp || waypoint.recordedAt || now,
                  now,
                ],
              );
              results.waypoints++;
            }
          } catch (locErr: any) {
            // Try RouteSessionLocation as fallback
            try {
              await client.query(
                `INSERT INTO "RouteSessionLocation" ("routeSessionId", "latitude", "longitude", "accuracy", "speed", "timestamp", "createdAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                  waypoint.routeSessionId || `route_${userId}_${now.split('T')[0]}`,
                  waypoint.latitude || waypoint.lat,
                  waypoint.longitude || waypoint.lng,
                  waypoint.accuracy || 0,
                  waypoint.speed || null,
                  waypoint.timestamp || now,
                  now,
                ],
              );
              results.waypoints++;
            } catch {
              // Both tables failed — skip silently
              console.warn('[SyncUpload] Failed to save waypoint - no matching route table found');
            }
          }

          await client.query('COMMIT');
        } catch (err: any) {
          try { await client.query('ROLLBACK'); } catch {}
          results.errors.push({ type: 'waypoint', localId: waypoint.id, error: err.message });
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Sync upload completed',
        stats: results,
      });
    } catch (error) {
      console.error('Error in orderbooker sync upload:', error);
      return NextResponse.json(
        { success: false, message: 'Sync upload failed' },
        { status: 500 },
      );
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in orderbooker sync upload:', error);
    return NextResponse.json(
      { success: false, message: 'Sync upload failed' },
      { status: 500 },
    );
  }
}
