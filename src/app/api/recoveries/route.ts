import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/recoveries?status=pending&orderbookerId=xxx
// Get pending (or all) recoveries grouped with shop + creator info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const orderbookerId = searchParams.get('orderbookerId');

    const where: Record<string, unknown> = {
      type: 'recovery',
      status,
    };

    if (orderbookerId) {
      where.createdBy = orderbookerId;
    }

    const transactions = await db.transaction.findMany({
      where,
      include: {
        shop: {
          select: { id: true, name: true, area: true, balance: true },
        },
        creator: {
          select: { id: true, name: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by orderbooker (creator)
    const grouped: Record<string, {
      orderbooker: { id: string; name: string; phone: string | null };
      transactions: typeof transactions;
      totalAmount: number;
    }> = {};

    for (const txn of transactions) {
      const obId = txn.createdBy;
      if (!grouped[obId]) {
        grouped[obId] = {
          orderbooker: { id: txn.creator.id, name: txn.creator.name, phone: txn.creator.phone },
          transactions: [],
          totalAmount: 0,
        };
      }
      grouped[obId].transactions.push(txn);
      grouped[obId].totalAmount += txn.amount;
    }

    // Calculate totals
    const totalPending = transactions.length;
    const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

    return NextResponse.json({
      transactions,
      grouped: Object.values(grouped),
      totalPending,
      totalAmount,
    });
  } catch (error) {
    console.error('Error fetching recoveries:', error);
    return NextResponse.json({ error: 'Failed to fetch recoveries' }, { status: 500 });
  }
}

// POST /api/recoveries - Approve or reject recoveries (single or bulk)
export async function POST(request: NextRequest) {
  try {
    const { action, transactionIds, approvedBy, rejectReason } = await request.json();

    if (!action || !transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0 || !approvedBy) {
      return NextResponse.json({ error: 'Action, transactionIds, and approvedBy are required' }, { status: 400 });
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Action must be "approve" or "reject"' }, { status: 400 });
    }

    // Fetch all pending transactions
    const pendingTxns = await db.transaction.findMany({
      where: {
        id: { in: transactionIds },
        type: 'recovery',
        status: 'pending',
      },
      include: {
        shop: { select: { id: true, name: true, balance: true } },
      },
    });

    if (pendingTxns.length === 0) {
      return NextResponse.json({ error: 'No pending recoveries found' }, { status: 404 });
    }

    if (pendingTxns.length !== transactionIds.length) {
      return NextResponse.json({
        error: `${transactionIds.length - pendingTxns.length} transaction(s) not found or not pending`,
        processed: pendingTxns.length,
        skipped: transactionIds.length - pendingTxns.length,
      }, { status: 400 });
    }

    const now = new Date();
    const results = await db.$transaction(async (tx) => {
      const processed = [];

      for (const txn of pendingTxns) {
        if (action === 'approve') {
          // Deduct from shop balance
          const newBalance = Math.round((txn.shop.balance - txn.amount) * 100) / 100;

          await tx.transaction.update({
            where: { id: txn.id },
            data: {
              status: 'approved',
              approvedBy,
              approvedAt: now,
              newBalance,
            },
          });

          await tx.shop.update({
            where: { id: txn.shop.id },
            data: { balance: newBalance },
          });

          processed.push({
            id: txn.id,
            shopName: txn.shop.name,
            amount: txn.amount,
            newBalance,
            action: 'approved',
          });
        } else {
          // Reject - don't touch shop balance
          await tx.transaction.update({
            where: { id: txn.id },
            data: {
              status: 'rejected',
              approvedBy,
              approvedAt: now,
              rejectReason: rejectReason || null,
            },
          });

          processed.push({
            id: txn.id,
            shopName: txn.shop.name,
            amount: txn.amount,
            action: 'rejected',
          });
        }
      }

      return processed;
    });

    // Create audit log
    try {
      const totalAmount = pendingTxns.reduce((sum, t) => sum + t.amount, 0);
      await db.auditLog.create({
        data: {
          action: action === 'approve' ? 'recovery_approved' : 'recovery_rejected',
          entityType: 'transaction',
          entityId: transactionIds[0],
          performedBy: approvedBy,
          newValue: JSON.stringify({
            action,
            transactionIds,
            count: pendingTxns.length,
            totalAmount,
            rejectReason: rejectReason || null,
          }),
          description: `${action === 'approve' ? 'Approved' : 'Rejected'} ${pendingTxns.length} recovery(ies) totaling Rs. ${Math.round(totalAmount)}`,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      processed: results.length,
      action,
      results,
    });
  } catch (error) {
    console.error('Error processing recovery action:', error);
    return NextResponse.json({ error: 'Failed to process recovery action' }, { status: 500 });
  }
}
