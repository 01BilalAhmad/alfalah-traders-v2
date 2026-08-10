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

    // At least one of phone / ownerName must be provided.
    const hasPhone = phone !== undefined && phone !== null;
    const hasOwner = ownerName !== undefined && ownerName !== null;
    if (!hasPhone && !hasOwner) {
      return NextResponse.json(
        { error: 'Either phone or ownerName must be provided' },
        { status: 400 },
      );
    }

    // Validate phone format (basic validation) — only if a non-empty phone was sent
    const trimmedPhone = hasPhone ? String(phone).trim() : undefined;
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

    // Build update query dynamically based on what fields are provided.
    // This allows updating phone alone, ownerName alone, or both together.
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (hasPhone) {
      setClauses.push(`phone = $${paramIdx++}`);
      params.push(trimmedPhone || null);
    }
    if (hasOwner) {
      const trimmedOwner = String(ownerName).trim();
      setClauses.push(`"ownerName" = $${paramIdx++}`);
      params.push(trimmedOwner || null);
    }
    setClauses.push(`"updatedAt" = $${paramIdx++}`);
    params.push(now);
    params.push(shopId);

    await pool.query(
      `UPDATE "Shop" SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      params,
    );

    return NextResponse.json({
      success: true,
      shopId,
      newPhone: hasPhone ? (trimmedPhone || null) : undefined,
      newOwnerName: hasOwner ? (String(ownerName).trim() || null) : undefined,
    });
  } catch (error) {
    console.error('Error updating shop phone:', error);
    return NextResponse.json({ error: 'Failed to update phone number' }, { status: 500 });
  }
}
