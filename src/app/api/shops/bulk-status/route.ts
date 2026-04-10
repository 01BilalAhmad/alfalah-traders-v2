import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/shops/bulk-status
export async function PATCH(request: NextRequest) {
  try {
    const { shopIds, status } = await request.json();

    if (!shopIds || !Array.isArray(shopIds) || shopIds.length === 0) {
      return NextResponse.json({ error: 'shopIds array is required' }, { status: 400 });
    }

    if (!status || !['active', 'inactive'].includes(status)) {
      return NextResponse.json({ error: 'status must be "active" or "inactive"' }, { status: 400 });
    }

    // Update all shops
    const result = await db.shop.updateMany({
      where: { id: { in: shopIds } },
      data: { status },
    });

    // Create audit log entry (best-effort, don't fail the operation)
    try {
      await db.auditLog.create({
        data: {
          action: 'edit',
          entityType: 'shop',
          entityId: 'bulk',
          newValue: JSON.stringify({ action: 'bulk-status', shopIds, status, count: result.count }),
          description: `Bulk ${status === 'active' ? 'reactivated' : 'deactivated'} ${result.count} shops`,
        },
      });
    } catch (auditError) {
      console.error('Audit log creation failed (non-blocking):', auditError);
    }

    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    console.error('Error bulk updating shop status:', error);
    return NextResponse.json({ error: 'Failed to bulk update shop status' }, { status: 500 });
  }
}
