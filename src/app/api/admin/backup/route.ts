import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-guard';

// GET /api/admin/backup - Creates a JSON backup of all data (Admin only)
export async function GET(request: NextRequest) {
  // Verify admin access
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    // Export users (orderbookers + admin)
    const users = await db.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        phone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Export shops (routeDays is native array from PostgreSQL)
    const shops = await db.shop.findMany({
      select: {
        id: true,
        name: true,
        ownerName: true,
        area: true,
        address: true,
        phone: true,
        routeDays: true,
        orderbookerId: true,
        balance: true,
        creditLimit: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Export transactions
    const transactions = await db.transaction.findMany({
      select: {
        id: true,
        shopId: true,
        type: true,
        amount: true,
        previousBalance: true,
        newBalance: true,
        description: true,
        createdBy: true,
        gpsLat: true,
        gpsLng: true,
        gpsAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Export audit logs
    const auditLogs = await db.auditLog.findMany({
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        performedBy: true,
        oldValue: true,
        newValue: true,
        description: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const backup = {
      metadata: {
        exportDate: new Date().toISOString(),
        version: '1.0',
        application: 'Finexa - Smart Credit Management',
        counts: {
          users: users.length,
          shops: shops.length,
          transactions: transactions.length,
          auditLogs: auditLogs.length,
        },
      },
      data: {
        users,
        shops,
        transactions,
        auditLogs,
      },
    };

    const dateStr = new Date().toISOString().split('T')[0];

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="finexa-backup-${dateStr}.json"`,
      },
    });
  } catch (error) {
    console.error('Error creating backup:', error);
    return NextResponse.json({ error: 'Failed to create backup' }, { status: 500 });
  }
}
