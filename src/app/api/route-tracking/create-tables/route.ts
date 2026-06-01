import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { ensureRouteTrackingTables } from '@/app/api/route-tracking/start/route';

// POST /api/route-tracking/create-tables
// Create the RouteTracking, RouteWaypoint, and RouteStop tables if they don't exist
// Uses the canonical ensureRouteTrackingTables function for consistent schema
export async function POST() {
  try {
    const pool = getPool();
    await ensureRouteTrackingTables(pool);

    return NextResponse.json({
      success: true,
      message: 'Route tracking tables created/verified successfully',
      tables: ['RouteTracking', 'RouteWaypoint', 'RouteStop'],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating route tracking tables:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
