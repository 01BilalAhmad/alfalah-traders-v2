import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';

// PATCH /api/shops/phone - Update shop phone number and/or owner name
// Accessible by any authenticated user (admin, orderbooker, or teller).
// Orderbookers use this from the mobile app when adding a phone number
// during recovery submission. Tellers use it from the tally screen.
// Every change is recorded in the AuditLog with before/after values.
export async function PATCH(request: NextRequest) {
  // Verify the user is authenticated (admin, orderbooker, or teller)
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

    // Fetch existing shop (capture old values for audit before mutating)
    const shopRes = await pool.query(
      'SELECT id, name, phone, "ownerName" FROM "Shop" WHERE id = $1',
      [shopId]
    );
    if (shopRes.rows.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }
    const oldRow = shopRes.rows[0];
    const oldPhone = oldRow.phone ?? null;
    const oldOwner = oldRow.ownerName ?? null;

    const now = new Date().toISOString();

    // Build update query dynamically based on what fields are provided.
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    const newPhoneValue = hasPhone ? (trimmedPhone || null) : oldPhone;
    const newOwnerValue = hasOwner ? (String(ownerName).trim() || null) : oldOwner;

    if (hasPhone) {
      setClauses.push(`phone = $${paramIdx++}`);
      params.push(newPhoneValue);
    }
    if (hasOwner) {
      setClauses.push(`"ownerName" = $${paramIdx++}`);
      params.push(newOwnerValue);
    }
    setClauses.push(`"updatedAt" = $${paramIdx++}`);
    params.push(now);
    params.push(shopId);

    await pool.query(
      `UPDATE "Shop" SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      params,
    );

    // ─── Audit log entry (best-effort, non-blocking) ────────────
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      const changes: Record<string, { from: any; to: any }> = {};
      if (hasPhone && oldPhone !== newPhoneValue) {
        changes.phone = { from: oldPhone, to: newPhoneValue };
      }
      if (hasOwner && oldOwner !== newOwnerValue) {
        changes.ownerName = { from: oldOwner, to: newOwnerValue };
      }
      const actorName = auth.user?.name || auth.userId;
      const actorRole = auth.user?.role || 'unknown';
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "performedBy", "oldValue", "newValue", description)
         VALUES ($1, 'update', 'shop', $2, $3, $4, $5, $6)`,
        [
          auditId,
          shopId,
          auth.userId,
          JSON.stringify({ phone: oldPhone, ownerName: oldOwner }),
          JSON.stringify(changes),
          `Shop details updated for "${oldRow.name}" by ${actorName} (${actorRole}): ${
            hasPhone && oldPhone !== newPhoneValue
              ? `phone ${oldPhone ?? '∅'} → ${newPhoneValue ?? '∅'}`
              : ''
          }${hasPhone && hasOwner && oldPhone !== newPhoneValue && oldOwner !== newOwnerValue ? '; ' : ''}${
            hasOwner && oldOwner !== newOwnerValue
              ? `owner ${oldOwner ?? '∅'} → ${newOwnerValue ?? '∅'}`
              : ''
          }`.trim(),
        ]
      );
    } catch (auditErr) {
      console.error('[shops/phone] AuditLog insert failed:', auditErr);
    }

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
