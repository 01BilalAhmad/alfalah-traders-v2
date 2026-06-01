import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';
import { areRouteTrackingTablesReady, createRouteTrackingTables, resetTableReadinessCache } from '@/lib/route-tracking-helpers';
import { db } from '@/lib/db';

// In-memory setting as fallback (used when DB is not available)
let routeTrackingEnabledMemory = true;

/**
 * Get route tracking setting from database.
 * Uses a simple approach: store setting in the UserPreference table with a special system userId.
 * Falls back to in-memory if DB is not available.
 */
async function getSetting(): Promise<boolean> {
  try {
    // Try to get from SiteConfig-like approach using raw SQL
    // We use a simple approach: check if a "route_tracking_disabled" key exists
    const result = await db.$queryRaw<Array<{ value: string }>>`
      SELECT value FROM "_prisma_migrations" LIMIT 0
    `.catch(() => null);

    // If we can query the DB, use a simple JSON config approach
    // Store in a lightweight config table (auto-created if needed)
    const configResult = await db.$queryRaw<Array<{ config_value: string }>>`
      SELECT config_value FROM "_finexa_config" WHERE config_key = 'route_tracking_enabled' LIMIT 1
    `.catch(() => [] as any[]);

    if (configResult && configResult.length > 0) {
      return configResult[0].config_value === 'true';
    }
    // No setting found in DB — default to true (enabled)
    return true;
  } catch {
    // DB not available or config table doesn't exist — use in-memory
    return routeTrackingEnabledMemory;
  }
}

/**
 * Save route tracking setting to database.
 */
async function setSetting(enabled: boolean): Promise<void> {
  try {
    // Try to create the config table if it doesn't exist
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_finexa_config" (
        "config_key" TEXT NOT NULL PRIMARY KEY,
        "config_value" TEXT NOT NULL,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_by" TEXT
      );
    `);

    // Upsert the setting
    await db.$executeRawUnsafe(`
      INSERT INTO "_finexa_config" (config_key, config_value, updated_at)
      VALUES ('route_tracking_enabled', '${enabled ? 'true' : 'false'}', CURRENT_TIMESTAMP)
      ON CONFLICT (config_key) 
      DO UPDATE SET config_value = '${enabled ? 'true' : 'false'}', updated_at = CURRENT_TIMESTAMP
    `);
  } catch {
    // Fallback to in-memory
    routeTrackingEnabledMemory = enabled;
  }

  // Always update in-memory too for immediate consistency
  routeTrackingEnabledMemory = enabled;
}

// GET /api/route-tracking/settings - Get feature toggle status
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const enabled = await getSetting();

    // Also check if tables are ready
    const tablesReady = await areRouteTrackingTablesReady();

    return NextResponse.json({
      routeTrackingEnabled: enabled,
      tablesReady,
    });
  } catch (error) {
    console.error('Error fetching route tracking settings:', error);
    // Return default settings instead of error
    return NextResponse.json({
      routeTrackingEnabled: routeTrackingEnabledMemory,
      tablesReady: false,
    });
  }
}

// PUT /api/route-tracking/settings - Toggle feature (admin only)
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { routeTrackingEnabled: enabled } = await request.json();

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'routeTrackingEnabled must be a boolean' },
        { status: 400 }
      );
    }

    // If enabling and tables don't exist, auto-create them
    if (enabled) {
      const tablesReady = await areRouteTrackingTablesReady();
      if (!tablesReady) {
        const result = await createRouteTrackingTables();
        if (result.created) {
          resetTableReadinessCache();
        }
      }
    }

    await setSetting(enabled);

    return NextResponse.json({
      routeTrackingEnabled: enabled,
      updatedBy: auth.user?.name || auth.userId,
      message: enabled ? 'Route tracking enabled' : 'Route tracking disabled',
    });
  } catch (error) {
    console.error('Error updating route tracking settings:', error);
    return NextResponse.json(
      { error: `Failed to update settings: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
