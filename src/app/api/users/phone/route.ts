import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';

// PATCH /api/users/phone - Update own phone number (self-service for orderbookers/distributors)
// Allows distributors to set their contact number that appears on payment receipts
export async function PATCH(request: NextRequest) {
  // SECURITY: Handler-level auth check — users can only update their own phone
  const auth = await requireAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const { userId, phone } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // SECURITY: Users can only update their own phone (admin can update any)
    if (auth.user?.role !== 'admin' && auth.userId !== userId) {
      return NextResponse.json({ error: 'You can only update your own phone number' }, { status: 403 });
    }

    if (phone === undefined || phone === null) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Validate phone format (basic validation)
    const trimmedPhone = String(phone).trim();
    if (trimmedPhone && !/^[\d+\-\s()]{7,15}$/.test(trimmedPhone)) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
    }

    const pool = getPool();

    // Check if user exists
    const userRes = await pool.query('SELECT id, name FROM "User" WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date().toISOString();

    await pool.query(
      'UPDATE "User" SET phone = $1, "updatedAt" = $2 WHERE id = $3',
      [trimmedPhone || null, now, userId]
    );

    return NextResponse.json({
      success: true,
      userId,
      newPhone: trimmedPhone || null,
    });
  } catch (error) {
    console.error('Error updating user phone:', error);
    return NextResponse.json({ error: 'Failed to update phone number' }, { status: 500 });
  }
}
