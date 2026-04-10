import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/shops/bulk-assign
export async function PATCH(request: NextRequest) {
  try {
    const { shopIds, orderbookerId } = await request.json();

    if (!shopIds || !Array.isArray(shopIds) || shopIds.length === 0) {
      return NextResponse.json({ error: 'shopIds array is required' }, { status: 400 });
    }

    if (!orderbookerId) {
      return NextResponse.json({ error: 'orderbookerId is required' }, { status: 400 });
    }

    // Verify the orderbooker exists and is active
    const orderbooker = await db.user.findUnique({ where: { id: orderbookerId } });
    if (!orderbooker || orderbooker.status !== 'active') {
      return NextResponse.json({ error: 'Active orderbooker not found' }, { status: 404 });
    }

    // Update all shops in a transaction
    const result = await db.shop.updateMany({
      where: { id: { in: shopIds } },
      data: { orderbookerId },
    });

    // Create audit log entries
    await db.auditLog.create({
      data: {
        action: 'edit',
        entityType: 'shop',
        entityId: 'bulk',
        performedBy: 'system',
        newValue: JSON.stringify({ action: 'bulk-assign', shopIds, orderbookerId, count: result.count }),
        description: `Bulk assigned ${result.count} shops to orderbooker ${orderbooker.name}`,
      },
    });

    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    console.error('Error bulk assigning shops:', error);
    return NextResponse.json({ error: 'Failed to bulk assign shops' }, { status: 500 });
  }
}
