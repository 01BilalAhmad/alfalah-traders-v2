/**
 * Route Tracking Helpers
 * 
 * Graceful handling for when RouteTracking/RouteStop/RouteWaypoint tables don't exist yet.
 * Uses raw pg pool instead of Prisma for resilience.
 */

import { getPool } from '@/lib/pg';
import { ensureRouteTrackingTables } from '@/app/api/route-tracking/start/route';

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
    const pool = getPool();
    // Try a simple SELECT query - if tables don't exist, this will throw
    await pool.query(`SELECT 1 FROM "RouteTracking" LIMIT 1`);
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
      msg.includes('connection') ||
      msg.includes('timeout') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND')
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
 * Create RouteTracking, RouteWaypoint, and RouteStop tables using raw SQL.
 * Uses the canonical ensureRouteTrackingTables function from start/route.ts
 * for consistent Prisma-compatible schema.
 */
export async function createRouteTrackingTables(): Promise<{ created: boolean; error?: string }> {
  try {
    // Check if already exist
    const ready = await areRouteTrackingTablesReady();
    if (ready) {
      return { created: false, error: 'Tables already exist' };
    }

    const pool = getPool();
    await ensureRouteTrackingTables(pool);

    // Verify tables were created
    const verifyReady = await areRouteTrackingTablesReady();
    if (verifyReady) {
      return { created: true };
    } else {
      return { created: false, error: 'Tables were not created successfully' };
    }
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
