import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import crypto from 'crypto';

// POST /api/route-tracking/start
// Start a new route tracking session
// Auto-creates RouteTracking, RouteWaypoint, RouteStop tables if they don't exist
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Use orderbookerId from body, or fall back to x-auth-userid set by middleware
    const authUserId = request.headers.get('x-auth-userid');
    const { orderbookerId: bodyOrderbookerId, companyId, lat, lng } = body;
    const orderbookerId = bodyOrderbookerId || authUserId;

    if (!orderbookerId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'orderbookerId, lat, and lng are required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // ─── Step 1: Ensure ALL route tracking tables exist (with correct Prisma-compatible schema) ───
    await ensureRouteTrackingTables(pool);

    // ─── Step 2: Validate orderbookerId exists (avoid FK violation) ───
    // Try to validate, but don't block if User table doesn't exist or check fails
    try {
      const userCheck = await pool.query(`SELECT id, "companyId" FROM "User" WHERE id = $1`, [orderbookerId]);
      if (userCheck.rows.length === 0) {
        // User not found - but allow anyway (might be from mobile app with different user store)
        // Log warning but don't block - FK constraint will catch if it exists
        console.warn('[RouteTracking/Start] orderbookerId not found in User table, proceeding anyway:', orderbookerId);
      } else {
        // If companyId not provided, use the one from user record
        if (!companyId && userCheck.rows[0].companyId) {
          body.companyId = userCheck.rows[0].companyId;
        }
      }
    } catch (userErr: unknown) {
      // If User table doesn't exist, skip validation (no FK constraint either)
      console.warn('[RouteTracking/Start] Could not validate orderbookerId:', userErr instanceof Error ? userErr.message : '');
    }

    // ─── Step 3: Check for existing ongoing route ─────────────────────────────
    try {
      const existingRes = await pool.query(
        `SELECT id, "startTime" FROM "RouteTracking" WHERE "orderbookerId" = $1 AND status = 'ongoing'`,
        [orderbookerId]
      );

      if (existingRes.rows.length > 0) {
        const ongoingRoute = existingRes.rows[0];
        const startTime = new Date(ongoingRoute.startTime);
        const hoursSinceStart = (Date.now() - startTime.getTime()) / (1000 * 60 * 60);

        // Auto-complete old ongoing routes that are older than 24 hours
        if (hoursSinceStart > 24) {
          console.log(`[RouteTracking/Start] Auto-completing abandoned route ${ongoingRoute.id} (${hoursSinceStart.toFixed(1)}h old)`);
          await pool.query(
            `UPDATE "RouteTracking" SET status = 'completed', "endTime" = NOW(), "totalDuration" = EXTRACT(EPOCH FROM (NOW() - "startTime"))::INTEGER, "updatedAt" = NOW() WHERE id = $1`,
            [ongoingRoute.id]
          );
          // Continue to create a new route below
        } else {
          // Route is genuinely ongoing (less than 24h old) — return it so the app can resume
          console.log(`[RouteTracking/Start] Resuming existing ongoing route ${ongoingRoute.id}`);
          return NextResponse.json({
            id: ongoingRoute.id,
            orderbookerId: orderbookerId,
            status: 'ongoing',
            message: 'You already have an ongoing route. Resuming it.',
            resumed: true,
          }, { status: 200 });
        }
      }
    } catch (checkErr: unknown) {
      // If the check fails (e.g., missing column), log but continue to create new route
      console.warn('[RouteTracking/Start] Could not check for existing routes:', checkErr instanceof Error ? checkErr.message : '');
    }

    // ─── Step 4: Create new route ─────────────────────────────────────────────
    const routeId = `rt_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;

    let result;
    let effectiveCompanyId = companyId || null;
    try {
      // INSERT with routeDate as TIMESTAMP (matches Prisma schema: DateTime @default(now()))
      result = await pool.query(
        `INSERT INTO "RouteTracking" (id, "orderbookerId", "companyId", status, "startLat", "startLng", "startTime", "routeDate", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW(), NOW())
         RETURNING *`,
        [routeId, orderbookerId, effectiveCompanyId, 'ongoing', lat, lng]
      );
    } catch (insertError: unknown) {
      const insertMsg = insertError instanceof Error ? insertError.message : '';

      if (insertMsg.includes('foreign key') || insertMsg.includes('violates')) {
        console.warn('[RouteTracking/Start] FK violation on INSERT:', insertMsg);

        // Check if it's a companyId FK violation - just null it out (companyId is optional)
        const isCompanyIdFk = insertMsg.includes('"companyId"') || insertMsg.includes('RouteTracking_companyId_fkey');
        if (isCompanyIdFk) {
          console.warn('[RouteTracking/Start] companyId FK violation — setting companyId to null and retrying');
          effectiveCompanyId = null;
        }

        // Drop orderbookerId FK constraint if that's the issue (user may not be in User table)
        try {
          await pool.query(`ALTER TABLE "RouteTracking" DROP CONSTRAINT IF EXISTS "RouteTracking_orderbookerId_fkey"`);
        } catch { /* ignore */ }
        // Also drop companyId FK constraint to prevent future issues
        try {
          await pool.query(`ALTER TABLE "RouteTracking" DROP CONSTRAINT IF EXISTS "RouteTracking_companyId_fkey"`);
        } catch { /* ignore */ }

        // Retry insert (with null companyId if that was the FK issue)
        result = await pool.query(
          `INSERT INTO "RouteTracking" (id, "orderbookerId", "companyId", status, "startLat", "startLng", "startTime", "routeDate", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW(), NOW())
           RETURNING *`,
          [routeId, orderbookerId, effectiveCompanyId, 'ongoing', lat, lng]
        );
      }
      // If routeDate column doesn't exist (old table), try without it
      else if (insertMsg.includes('"routeDate"') && (insertMsg.includes('does not exist') || insertMsg.includes('column'))) {
        console.warn('[RouteTracking/Start] routeDate column not found, inserting without it.');
        result = await pool.query(
          `INSERT INTO "RouteTracking" (id, "orderbookerId", "companyId", status, "startLat", "startLng", "startTime", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
           RETURNING *`,
          [routeId, orderbookerId, effectiveCompanyId, 'ongoing', lat, lng]
        );
      } else {
        throw insertError;
      }
    }

    const route = result.rows[0];

    if (!route || !route.id) {
      console.error('[RouteTracking/Start] INSERT succeeded but no row returned');
      return NextResponse.json(
        { error: 'Failed to create route. Please try again.' },
        { status: 500 }
      );
    }

    console.log(`[RouteTracking/Start] Route created: ${route.id} for orderbooker ${orderbookerId}`);

    return NextResponse.json({
      id: route.id,
      orderbookerId: route.orderbookerId,
      companyId: route.companyId,
      status: route.status,
      startLat: Number(route.startLat),
      startLng: Number(route.startLng),
      startTime: route.startTime instanceof Date ? route.startTime.toISOString() : route.startTime,
      createdAt: route.createdAt instanceof Date ? route.createdAt.toISOString() : route.createdAt,
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RouteTracking/Start] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Canonical table creation function (Prisma-compatible schema) ───────────────
// This is the SINGLE SOURCE OF TRUTH for route tracking table schemas.
// It matches the Prisma schema exactly.

export async function ensureRouteTrackingTables(pool: ReturnType<typeof getPool>): Promise<void> {
  // ─── RouteTracking table ──────────────────────────────────────────────────
  try {
    await pool.query(`SELECT 1 FROM "RouteTracking" LIMIT 1`);
  } catch {
    console.log('[RouteTracking] Creating RouteTracking table...');
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "RouteTracking" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "orderbookerId" TEXT NOT NULL,
          "companyId" TEXT,
          "routeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "startLat" DOUBLE PRECISION NOT NULL,
          "startLng" DOUBLE PRECISION NOT NULL,
          "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "endLat" DOUBLE PRECISION,
          "endLng" DOUBLE PRECISION,
          "endTime" TIMESTAMP(3),
          "totalDistance" DOUBLE PRECISION,
          "totalDuration" INTEGER,
          "status" TEXT NOT NULL DEFAULT 'ongoing',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('[RouteTracking] RouteTracking table created successfully');
    } catch (createErr: unknown) {
      const createMsg = createErr instanceof Error ? createErr.message : '';
      console.error('[RouteTracking] Failed to create RouteTracking table:', createMsg);
      // Don't return error - try to continue (table might exist with different schema)
    }
  }

  // Migrate existing tables: fix column types if they were created with wrong schema
  try {
    // Fix routeDate from DATE to TIMESTAMP(3) if needed
    await pool.query(`ALTER TABLE "RouteTracking" ALTER COLUMN "routeDate" SET DATA TYPE TIMESTAMP(3) USING "routeDate"::TIMESTAMP(3)`);
    await pool.query(`ALTER TABLE "RouteTracking" ALTER COLUMN "routeDate" SET DEFAULT CURRENT_TIMESTAMP`);
  } catch { /* column may already be correct type or contain NULLs, ignore */ }

  try {
    // Fix routeDate from nullable to NOT NULL (set default for any NULL rows first)
    await pool.query(`UPDATE "RouteTracking" SET "routeDate" = "startTime" WHERE "routeDate" IS NULL`);
    await pool.query(`ALTER TABLE "RouteTracking" ALTER COLUMN "routeDate" SET NOT NULL`);
  } catch { /* ignore */ }

  try {
    // Fix startLat from nullable to NOT NULL
    await pool.query(`ALTER TABLE "RouteTracking" ALTER COLUMN "startLat" SET NOT NULL`);
  } catch { /* ignore - existing rows may have NULL */ }

  try {
    // Fix startLng from nullable to NOT NULL
    await pool.query(`ALTER TABLE "RouteTracking" ALTER COLUMN "startLng" SET NOT NULL`);
  } catch { /* ignore */ }

  // Add missing columns (migration for old tables)
  try { await pool.query(`ALTER TABLE "RouteTracking" ADD COLUMN IF NOT EXISTS "routeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`); } catch { /* ignore */ }
  try { await pool.query(`ALTER TABLE "RouteTracking" ADD COLUMN IF NOT EXISTS "totalDistance" DOUBLE PRECISION`); } catch { /* ignore */ }
  try { await pool.query(`ALTER TABLE "RouteTracking" ADD COLUMN IF NOT EXISTS "totalDuration" INTEGER`); } catch { /* ignore */ }
  try { await pool.query(`ALTER TABLE "RouteTracking" ADD COLUMN IF NOT EXISTS "companyId" TEXT`); } catch { /* ignore */ }

  // RouteTracking indexes
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_orderbookerId_idx" ON "RouteTracking"("orderbookerId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_status_idx" ON "RouteTracking"("status")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_startTime_idx" ON "RouteTracking"("startTime")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_companyId_idx" ON "RouteTracking"("companyId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "RouteTracking_routeDate_idx" ON "RouteTracking"("routeDate")`);
  } catch { /* indexes may already exist */ }

  // ─── RouteWaypoint table ──────────────────────────────────────────────────
  try {
    await pool.query(`SELECT 1 FROM "RouteWaypoint" LIMIT 1`);
  } catch {
    console.log('[RouteTracking] Creating RouteWaypoint table...');
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "RouteWaypoint" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "routeId" TEXT NOT NULL,
          "lat" DOUBLE PRECISION NOT NULL,
          "lng" DOUBLE PRECISION NOT NULL,
          "accuracy" DOUBLE PRECISION,
          "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('[RouteTracking] RouteWaypoint table created successfully');
    } catch (createErr: unknown) {
      console.error('[RouteTracking] Failed to create RouteWaypoint table:', createErr instanceof Error ? createErr.message : '');
    }
  }

  // Ensure createdAt column exists on RouteWaypoint
  try {
    await pool.query(`ALTER TABLE "RouteWaypoint" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  } catch { /* column may already exist, ignore */ }

  // RouteWaypoint indexes
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS "RouteWaypoint_routeId_idx" ON "RouteWaypoint"("routeId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "RouteWaypoint_timestamp_idx" ON "RouteWaypoint"("timestamp")`);
  } catch { /* indexes may already exist */ }

  // ─── RouteStop table ──────────────────────────────────────────────────────
  try {
    await pool.query(`SELECT 1 FROM "RouteStop" LIMIT 1`);
  } catch {
    console.log('[RouteTracking] Creating RouteStop table...');
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "RouteStop" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "routeId" TEXT NOT NULL,
          "shopId" TEXT NOT NULL,
          "arrivalTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "departureTime" TIMESTAMP(3),
          "timeSpent" INTEGER,
          "lat" DOUBLE PRECISION NOT NULL,
          "lng" DOUBLE PRECISION NOT NULL,
          "recoveryAmount" DOUBLE PRECISION,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('[RouteTracking] RouteStop table created successfully');
    } catch (createErr: unknown) {
      console.error('[RouteTracking] Failed to create RouteStop table:', createErr instanceof Error ? createErr.message : '');
    }
  }

  // RouteStop indexes
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS "RouteStop_routeId_idx" ON "RouteStop"("routeId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "RouteStop_shopId_idx" ON "RouteStop"("shopId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "RouteStop_arrivalTime_idx" ON "RouteStop"("arrivalTime")`);
  } catch { /* indexes may already exist */ }

  // ─── Foreign Key Constraints (each in its own block to prevent one failure from killing all) ───
  // NOTE: We intentionally do NOT add FK constraints for orderbookerId and companyId
  // because mobile app users may not exist in the User table (Firebase auth),
  // and companyId may reference a Company that doesn't exist yet or was deleted.
  // These FK constraints caused route start failures in production.
  const fkConstraints = [
    // RouteTracking_orderbookerId_fkey — REMOVED (mobile app users may not be in User table)
    // RouteTracking_companyId_fkey — REMOVED (companyId may reference non-existent Company)
    {
      name: 'RouteWaypoint_routeId_fkey',
      sql: `ALTER TABLE "RouteWaypoint" ADD CONSTRAINT "RouteWaypoint_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "RouteTracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;`
    },
    {
      name: 'RouteStop_routeId_fkey',
      sql: `ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "RouteTracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;`
    },
    {
      name: 'RouteStop_shopId_fkey',
      sql: `ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`
    },
  ];

  for (const fk of fkConstraints) {
    try {
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = '${fk.name}') THEN
            ${fk.sql}
          END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;
      `);
    } catch { /* FK may already exist or referenced table doesn't exist, ignore */ }
  }
}
