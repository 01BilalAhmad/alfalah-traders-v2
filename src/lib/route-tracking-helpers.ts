/**
 * Route Tracking Helpers
 * 
 * Graceful handling for when RouteTracking/RouteStop tables don't exist yet.
 * These tables are created after the first `prisma db push` or via the setup endpoint.
 */

import { db } from '@/lib/db';

let tablesReadyCache: boolean | null = null;
let lastCheckTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if RouteTracking and RouteStop tables exist in the database.
 * Results are cached for 5 minutes to avoid repeated queries.
 */
export async function areRouteTrackingTablesReady(): Promise<boolean> {
  const now = Date.now();
  if (tablesReadyCache !== null && (now - lastCheckTime) < CACHE_TTL) {
    return tablesReadyCache;
  }

  try {
    // Guard: if Prisma client doesn't have the model (e.g. not generated yet), treat as not ready
    if (!db || !(db as any).routeTracking) {
      console.warn('[RouteTrackingHelpers] Prisma client does not have routeTracking model');
      tablesReadyCache = false;
      lastCheckTime = now;
      return false;
    }

    // Try a simple count query - if tables don't exist, this will throw
    await db.routeTracking.count({ take: 1 });
    tablesReadyCache = true;
    lastCheckTime = now;
    return true;
  } catch (error: any) {
    // Table doesn't exist error patterns from PostgreSQL/Neon
    const msg = (error?.message || '').toLowerCase();
    if (
      msg.includes('does not exist') ||
      msg.includes('relation') ||
      msg.includes('no such table') ||
      msg.includes('cannot find') ||
      msg.includes('prisma client could not') ||
      msg.includes('cannot read propert') ||  // TypeError: Cannot read properties of undefined
      msg.includes('is not a function') ||     // db.routeTracking is not a function
      msg.includes('model is not known') ||    // Prisma: Model is not known
      msg.includes('invalid prisma') ||        // Prisma client not generated
      msg.includes('undefined') ||             // Generic undefined access
      msg.includes('connection') ||            // DB connection errors
      msg.includes('timeout') ||               // DB timeout errors
      msg.includes('ECONNREFUSED') ||          // Connection refused
      msg.includes('ENOTFOUND')                // DNS resolution failed
    ) {
      tablesReadyCache = false;
      lastCheckTime = now;
      return false;
    }
    // Any other error - don't crash, treat as not ready and log
    console.error('[RouteTrackingHelpers] Unexpected error checking tables, treating as not ready:', error?.message || error);
    tablesReadyCache = false;
    lastCheckTime = now;
    return false;
  }
}

/**
 * Create RouteTracking and RouteStop tables using raw SQL.
 * This is called from the setup endpoint when tables don't exist.
 */
export async function createRouteTrackingTables(): Promise<{ created: boolean; error?: string }> {
  try {
    // Check if already exist
    const ready = await areRouteTrackingTablesReady();
    if (ready) {
      return { created: false, error: 'Tables already exist' };
    }

    // Create RouteTracking table
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RouteTracking" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "orderbookerId" TEXT NOT NULL,
        "companyId" TEXT,
        "routeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "startLat" DOUBLE PRECISION NOT NULL,
        "startLng" DOUBLE PRECISION NOT NULL,
        "startTime" TIMESTAMP(3) NOT NULL,
        "endLat" DOUBLE PRECISION,
        "endLng" DOUBLE PRECISION,
        "endTime" TIMESTAMP(3),
        "totalDistance" DOUBLE PRECISION,
        "status" TEXT NOT NULL DEFAULT 'ongoing',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for RouteTracking
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RouteTracking_orderbookerId_idx" ON "RouteTracking"("orderbookerId");
    `);
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RouteTracking_routeDate_idx" ON "RouteTracking"("routeDate");
    `);
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RouteTracking_status_idx" ON "RouteTracking"("status");
    `);
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RouteTracking_companyId_idx" ON "RouteTracking"("companyId");
    `);

    // Create RouteStop table
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RouteStop" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "routeId" TEXT NOT NULL,
        "shopId" TEXT NOT NULL,
        "arrivalTime" TIMESTAMP(3) NOT NULL,
        "departureTime" TIMESTAMP(3),
        "timeSpent" INTEGER,
        "lat" DOUBLE PRECISION NOT NULL,
        "lng" DOUBLE PRECISION NOT NULL,
        "recoveryAmount" DOUBLE PRECISION,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for RouteStop
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RouteStop_routeId_idx" ON "RouteStop"("routeId");
    `);
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RouteStop_shopId_idx" ON "RouteStop"("shopId");
    `);

    // Add foreign key constraints
    await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'RouteStop_routeId_fkey'
        ) THEN
          ALTER TABLE "RouteStop" 
          ADD CONSTRAINT "RouteStop_routeId_fkey" 
          FOREIGN KEY ("routeId") REFERENCES "RouteTracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'RouteStop_shopId_fkey'
        ) THEN
          ALTER TABLE "RouteStop" 
          ADD CONSTRAINT "RouteStop_shopId_fkey" 
          FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'RouteTracking_orderbookerId_fkey'
        ) THEN
          ALTER TABLE "RouteTracking" 
          ADD CONSTRAINT "RouteTracking_orderbookerId_fkey" 
          FOREIGN KEY ("orderbookerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'RouteTracking_companyId_fkey'
        ) THEN
          ALTER TABLE "RouteTracking" 
          ADD CONSTRAINT "RouteTracking_companyId_fkey" 
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    // Reset cache so next check re-validates
    tablesReadyCache = true;
    lastCheckTime = Date.now();

    return { created: true };
  } catch (error: any) {
    console.error('Failed to create RouteTracking tables:', error);
    return { created: false, error: error?.message || 'Unknown error' };
  }
}

/**
 * Reset the table readiness cache (call after setup)
 */
export function resetTableReadinessCache(): void {
  tablesReadyCache = null;
  lastCheckTime = 0;
}
