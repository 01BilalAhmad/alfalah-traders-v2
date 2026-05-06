import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// PATCH /api/shops/phone - Update shop phone number (lightweight endpoint for mobile)
export async function PATCH(request: NextRequest) {
  let client;
  try {
    const { shopId, phone } = await request.json();

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

    client = getPgClient();
    await client.connect();

    // Check if shop exists
    const shopRes = await client.query('SELECT id, name, phone FROM "Shop" WHERE id = $1', [shopId]);
    if (shopRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const oldPhone = shopRes.rows[0].phone;
    const now = new Date().toISOString();

    await client.query(
      'UPDATE "Shop" SET phone = $1, "updatedAt" = $2 WHERE id = $3',
      [trimmedPhone || null, now, shopId]
    );

    await client.end();

    return NextResponse.json({
      success: true,
      shopId,
      oldPhone,
      newPhone: trimmedPhone || null,
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error updating shop phone:', error);
    return NextResponse.json({ error: 'Failed to update phone number' }, { status: 500 });
  }
}
