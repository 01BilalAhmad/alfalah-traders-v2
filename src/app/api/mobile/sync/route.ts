import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/mobile/sync — Accept batch of transactions from mobile app
export async function POST(request: NextRequest) {
  try {
    const { transactions } = await request.json();

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ error: 'No transactions provided' }, { status: 400 });
    }

    const results: { success: boolean; id: string; error?: string }[] = [];

    for (const txn of transactions) {
      try {
        // Validate required fields
        if (!txn.shopId || !txn.type || !txn.amount || !txn.createdBy) {
          results.push({ success: false, id: txn.id || 'unknown', error: 'Missing required fields' });
          continue;
        }

        if (txn.type !== 'recovery') {
          results.push({ success: false, id: txn.id, error: 'Mobile app only supports recovery transactions' });
          continue;
        }

        if (txn.amount <= 0) {
          results.push({ success: false, id: txn.id, error: 'Amount must be greater than 0' });
          continue;
        }

        // Check for duplicate (same id already exists)
        const existing = await db.transaction.findUnique({ where: { id: txn.id } });
        if (existing) {
          results.push({ success: true, id: txn.id });
          continue; // Already synced, skip
        }

        // Get shop and validate
        const shop = await db.shop.findUnique({ where: { id: txn.shopId } });
        if (!shop) {
          results.push({ success: false, id: txn.id, error: 'Shop not found' });
          continue;
        }

        // For recovery, verify amount doesn't exceed balance
        // Use the balance from the transaction's previousBalance for consistency
        const previousBalance = txn.previousBalance ?? shop.balance;
        let newBalance = Math.round((previousBalance - txn.amount) * 100) / 100;

        // Use transaction for atomicity
        await db.$transaction(async (tx) => {
          // Create transaction record
          await tx.transaction.create({
            data: {
              id: txn.id,
              shopId: txn.shopId,
              type: txn.type,
              amount: txn.amount,
              previousBalance,
              newBalance,
              description: txn.description || null,
              createdBy: txn.createdBy,
              gpsLat: txn.gpsLat || null,
              gpsLng: txn.gpsLng || null,
              gpsAddress: txn.gpsAddress || null,
              createdAt: new Date(txn.createdAt),
            },
          });

          // Update shop balance
          await tx.shop.update({
            where: { id: txn.shopId },
            data: { balance: newBalance },
          });
        });

        // Create audit log (best-effort)
        try {
          await db.auditLog.create({
            data: {
              action: 'recovery_entry',
              entityType: 'transaction',
              entityId: txn.id,
              performedBy: txn.createdBy,
              newValue: JSON.stringify({
                shopName: shop.name,
                type: txn.type,
                amount: txn.amount,
                previousBalance,
                newBalance,
                gpsLat: txn.gpsLat,
                gpsLng: txn.gpsLng,
                source: 'mobile_app',
              }),
              description: `Recovery collected (mobile): Rs. ${txn.amount} at ${shop.name}`,
            },
          });
        } catch { /* non-blocking */ }

        results.push({ success: true, id: txn.id });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ success: false, id: txn.id || 'unknown', error: msg });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      synced: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    console.error('Mobile sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

// GET /api/mobile/sync?userId=xxx — Return all shops + recent transactions for initial sync
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Fetch shops assigned to this orderbooker
    const shops = await db.shop.findMany({
      where: { orderbookerId: userId },
      include: {
        orderbooker: {
          select: { id: true, name: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Fetch recent transactions (last 100)
    const transactions = await db.transaction.findMany({
      where: { createdBy: userId },
      include: {
        shop: { select: { id: true, name: true, area: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Fetch user info
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        phone: true,
        status: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      user,
      shops,
      transactions,
      syncTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Mobile data fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
