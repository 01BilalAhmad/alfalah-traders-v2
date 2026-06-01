import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';
import { areRouteTrackingTablesReady, createRouteTrackingTables, resetTableReadinessCache } from '@/lib/route-tracking-helpers';
import { db } from '@/lib/db';

// In-memory setting as fallback (used when DB is not available)
let routeTrackingEnabledMemory = true;

/**
 * Get route tracking setting from database using Prisma model.
 * Falls back to raw SQL if Prisma model isn't available yet, then in-memory.
 */
async function getSetting(): Promise<boolean> {
  try {
    // Try Prisma model first (most reliable, won't be dropped by prisma db push)
    if ((db as any).finexaConfig) {
      const config = await (db as any).finexaConfig.findUnique({
        where: { key: 'route_tracking_enabled' },
      });
      if (config) {
        return config.value === 'true';
      }
      // No setting found — default to true
      return true;
    }

    // Fallback: try raw SQL (for when Prisma client hasn't been regenerated yet)
    const configResult = await db.$queryRaw<Array<{ config_value: string }>>`
      SELECT config_value FROM "_finexa_config" WHERE config_key = 'route_tracking_enabled' LIMIT 1
    `.catch(() => [] as any[]);

    if (configResult && configResult.length > 0) {
      return configResult[0].config_value === 'true';
    }
    return true;
  } catch {
    return routeTrackingEnabledMemory;
  }
}

/**
 * Save route tracking setting to database using Prisma model.
 * Falls back to raw SQL if needed.
 */
async function setSetting(enabled: boolean, updatedBy?: string): Promise<void> {
  try {
    // Try Prisma model first
    if ((db as any).finexaConfig) {
      await (db as any).finexaConfig.upsert({
        where: { key: 'route_tracking_enabled' },
        update: { value: enabled ? 'true' : 'false', updatedBy: updatedBy || null },
        create: { key: 'route_tracking_enabled', value: enabled ? 'true' : 'false', updatedBy: updatedBy || null },
      });
    } else {
      // Fallback: raw SQL
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "_finexa_config" (
          "config_key" TEXT NOT NULL PRIMARY KEY,
          "config_value" TEXT NOT NULL,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_by" TEXT
        );
      `);
      await db.$executeRawUnsafe(`
        INSERT INTO "_finexa_config" (config_key, config_value, updated_at)
        VALUES ('route_tracking_enabled', '${enabled ? 'true' : 'false'}', CURRENT_TIMESTAMP)
        ON CONFLICT (config_key) 
        DO UPDATE SET config_value = '${enabled ? 'true' : 'false'}', updated_at = CURRENT_TIMESTAMP
      `);
    }
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

    await setSetting(enabled, auth.user?.name || auth.userId || undefined);

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
