import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { areRouteTrackingTablesReady, createRouteTrackingTables, resetTableReadinessCache } from '@/lib/route-tracking-helpers';

// GET /api/route-tracking/setup - Check if route tracking tables exist
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const ready = await areRouteTrackingTablesReady();
    return NextResponse.json({
      tablesReady: ready,
      message: ready ? 'Route tracking tables are ready' : 'Route tracking tables need to be created',
    });
  } catch (error) {
    console.error('Error checking route tracking setup:', error);
    return NextResponse.json(
      { error: `Setup check failed: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// POST /api/route-tracking/setup - Create route tracking tables
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const result = await createRouteTrackingTables();
    if (result.created) {
      resetTableReadinessCache();
      return NextResponse.json({
        success: true,
        message: 'Route tracking tables created successfully',
      });
    } else {
      return NextResponse.json({
        success: true,
        message: result.error || 'Tables already exist',
      });
    }
  } catch (error) {
    console.error('Error creating route tracking tables:', error);
    return NextResponse.json(
      { error: `Setup failed: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
