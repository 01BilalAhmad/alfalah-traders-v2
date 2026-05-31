import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';

// In-memory setting (persisted in memory, resets on server restart)
// In production, this would be stored in the database
let routeTrackingEnabled = true;

// GET /api/route-tracking/settings - Get feature toggle status
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    return NextResponse.json({
      routeTrackingEnabled,
    });
  } catch (error) {
    console.error('Error fetching route tracking settings:', error);
    return NextResponse.json(
      { error: `Failed to fetch settings: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
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

    routeTrackingEnabled = enabled;

    return NextResponse.json({
      routeTrackingEnabled,
      updatedBy: auth.user?.name || auth.userId,
    });
  } catch (error) {
    console.error('Error updating route tracking settings:', error);
    return NextResponse.json(
      { error: `Failed to update settings: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
