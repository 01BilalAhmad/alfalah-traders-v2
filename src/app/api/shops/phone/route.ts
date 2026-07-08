import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';

// PATCH /api/shops/phone - Update shop phone number and/or owner name
// Accessible by any authenticated user (admin or orderbooker).
// Orderbookers use this from the mobile app when adding a phone number
// during recovery submission.
export async function PATCH(request: NextRequest) {
  // Verify the user is authenticated (admin or orderbooker)
  const auth = await requireAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const { shopId, phone, ownerName } = await request.json();

    if (!shopId) {
      return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
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

    // Check if shop exists
    const shopRes = await pool.query('SELECT id, name FROM "Shop" WHERE id = $1', [shopId]);
    if (shopRes.rows.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const now = new Date().toISOString();

    // Build update query dynamically based on what fields are provided
    if (ownerName !== undefined && ownerName !== null) {
      const trimmedOwner = String(ownerName).trim();
      await pool.query(
        'UPDATE "Shop" SET phone = $1, "ownerName" = $2, "updatedAt" = $3 WHERE id = $4',
        [trimmedPhone || null, trimmedOwner || null, now, shopId]
      );
    } else {
      await pool.query(
        'UPDATE "Shop" SET phone = $1, "updatedAt" = $2 WHERE id = $3',
        [trimmedPhone || null, now, shopId]
      );
    }

    return NextResponse.json({
      success: true,
      shopId,
      newPhone: trimmedPhone || null,
    });
  } catch (error) {
    console.error('Error updating shop phone:', error);
    return NextResponse.json({ error: 'Failed to update phone number' }, { status: 500 });
  }
}
