import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// PATCH /api/users/phone - Update own phone number (self-service for orderbookers/distributors)
// Allows distributors to set their contact number that appears on payment receipts
export async function PATCH(request: NextRequest) {
  let client;
  try {
    const { userId, phone } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
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

    // Check if user exists
    const userRes = await client.query('SELECT id, name, phone FROM "User" WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const oldPhone = userRes.rows[0].phone;
    const now = new Date().toISOString();

    await client.query(
      'UPDATE "User" SET phone = $1, "updatedAt" = $2 WHERE id = $3',
      [trimmedPhone || null, now, userId]
    );

    await client.end();

    return NextResponse.json({
      success: true,
      userId,
      oldPhone,
      newPhone: trimmedPhone || null,
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error updating user phone:', error);
    return NextResponse.json({ error: 'Failed to update phone number' }, { status: 500 });
  }
}
