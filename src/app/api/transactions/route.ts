import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Business rule constants
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500000;
const DAILY_CREDIT_CAP = 500000;


// Helper: Convert a date string (YYYY-MM-DD) to Pakistan timezone boundaries
function getPakistanDayRange(dateStr: string): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Pakistan is UTC+5, so midnight PKT = 19:00 UTC previous day
  const start = new Date(Date.UTC(year, month - 1, day, -5, 0, 0, 0)); // 00:00 PKT = 19:00 UTC prev
  const end = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999)); // 23:59:59 PKT = 18:59:59 UTC
  return { start, end };
}

// GET /api/transactions?shopId=xxx&orderbookerId=xxx&date=xxx&startDate=xxx&type=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get('shopId');
    const orderbookerId = searchParams.get('orderbookerId');
    const date = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const type = searchParams.get('type');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const createdBy = searchParams.get('createdBy');
    const where: Record<string, unknown> = {};
    if (shopId) where.shopId = shopId;
    if (type) where.type = type;
    if (createdBy) where.createdBy = createdBy;
    if (orderbookerId) {
      where.shop = { orderbookerId };
    }
    if (date) {
      // Use Pakistan timezone for date filtering
      const { start, end } = getPakistanDayRange(date);
      where.createdAt = { gte: start, lte: end };
    } else if (startDate) {
      // Use Pakistan timezone for start date
      const { start } = getPakistanDayRange(startDate);
      where.createdAt = { gte: start };
    }

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where,
        include: {
          shop: {
            select: { id: true, name: true, area: true },
          },
          creator: {
            select: { id: true, name: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.transaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}

// POST /api/transactions - Create a transaction (credit or recovery)
export async function POST(request: NextRequest) {
  try {
    const { shopId, type, amount, description, createdBy, gpsLat, gpsLng, gpsAddress } = await request.json();

    if (!shopId || !type || !amount || !createdBy) {
      return NextResponse.json({ error: 'Shop, type, amount, and creator are required' }, { status: 400 });
    }

    if (type !== 'credit' && type !== 'recovery') {
      return NextResponse.json({ error: 'Type must be credit or recovery' }, { status: 400 });
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    // Validation 1: Minimum amount
    if (amount < MIN_AMOUNT) {
      return NextResponse.json({ error: `Minimum transaction amount is Rs. ${MIN_AMOUNT.toLocaleString()}` }, { status: 400 });
    }

    // Validation 2: Maximum single transaction
    if (amount > MAX_AMOUNT) {
      return NextResponse.json({ error: `Maximum single transaction amount is Rs. ${MAX_AMOUNT.toLocaleString()}` }, { status: 400 });
    }

    // Validation 3: Description max length
    if (description && typeof description === 'string' && description.length > 200) {
      return NextResponse.json({ error: 'Description must be 200 characters or less' }, { status: 400 });
    }

    const shop = await db.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Validation 4: For credit type, check if shop is active
    if (type === 'credit' && shop.status !== 'active') {
      return NextResponse.json({ error: `Cannot post credit to inactive shop "${shop.name}". Activate the shop first.` }, { status: 400 });
    }

    // Validation 5: For recovery type, cannot recover more than shop balance
    if (type === 'recovery' && amount > shop.balance) {
      return NextResponse.json({
        error: `Recovery amount (Rs. ${amount.toLocaleString()}) exceeds shop balance (Rs. ${shop.balance.toLocaleString()}). Maximum recovery allowed: Rs. ${shop.balance.toLocaleString()}`,
      }, { status: 400 });
    }

    // Validation 6: For credit type, check daily credit cap per shop
    const warnings: string[] = [];
    if (type === 'credit') {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const [year, month, day] = todayStr.split('-').map(Number);
      const dayStart = new Date(Date.UTC(year, month - 1, day, -5, 0, 0, 0));
      const dayEnd = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));

      const todayCredits = await db.transaction.aggregate({
        _sum: { amount: true },
        where: {
          shopId,
          type: 'credit',
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      });

      const todayCreditTotal = todayCredits._sum.amount || 0;
      if (todayCreditTotal + amount > DAILY_CREDIT_CAP) {
        return NextResponse.json({
          error: `Daily credit cap exceeded for this shop. Today's total: Rs. ${todayCreditTotal.toLocaleString()}, this entry: Rs. ${amount.toLocaleString()}, combined: Rs. ${(todayCreditTotal + amount).toLocaleString()} (limit: Rs. ${DAILY_CREDIT_CAP.toLocaleString()})`,
        }, { status: 400 });
      }

      // Validation 7: Check if shop's orderbooker is active (warning only)
      if (shop.orderbookerId) {
        try {
          const orderbooker = await db.user.findUnique({
            where: { id: shop.orderbookerId },
            select: { id: true, name: true, status: true },
          });
          if (orderbooker && orderbooker.status === 'inactive') {
            warnings.push(`The assigned orderbooker (${orderbooker.name}) is currently inactive. Credit has been posted with a warning.`);
          }
        } catch {
          // Non-blocking — don't fail the transaction
        }
      }
    }

    const previousBalance = shop.balance;
    let newBalance: number;

    if (type === 'credit') {
      newBalance = previousBalance + amount;
    } else {
      // Recovery: if pending approval mode, don't deduct balance yet
      // Balance will be deducted when admin approves
      newBalance = previousBalance; // stays same until approved
    }

    // Check credit limit warning for credit transactions
    let creditLimitWarning: { limit: number; currentBalance: number; exceeded: boolean } | null = null;
    if (type === 'credit' && shop.creditLimit && shop.creditLimit > 0) {
      const projectedBalance = previousBalance + amount;
      creditLimitWarning = {
        limit: shop.creditLimit,
        currentBalance: Math.round(projectedBalance * 100) / 100,
        exceeded: projectedBalance > shop.creditLimit,
      };
    }

    // Recovery status: pending (awaiting admin approval)
    const txnStatus = type === 'recovery' ? 'pending' : 'approved';

    // Use a transaction to ensure atomicity
    const transaction = await db.$transaction(async (tx) => {
      // Create transaction record
      const txn = await tx.transaction.create({
        data: {
          shopId,
          type,
          status: txnStatus,
          amount,
          previousBalance,
          newBalance: Math.round(newBalance * 100) / 100,
          description,
          createdBy,
          gpsLat: gpsLat || null,
          gpsLng: gpsLng || null,
          gpsAddress: gpsAddress || null,
        },
        include: {
          shop: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
        },
      });

      // Update shop balance only for credit transactions
      // Recovery balance will be updated when admin approves
      if (type === 'credit') {
        await tx.shop.update({
          where: { id: shopId },
          data: { balance: Math.round(newBalance * 100) / 100 },
        });
      }

      return txn;
    });

    // Create audit log (best-effort)
    try {
      await db.auditLog.create({
        data: {
          action: type === 'credit' ? 'credit_post' : 'recovery_entry',
          entityType: 'transaction',
          entityId: transaction.id,
          performedBy: createdBy,
          newValue: JSON.stringify({
            shopName: shop.name,
            type,
            amount,
            previousBalance,
            newBalance: Math.round(newBalance * 100) / 100,
            gpsLat,
            gpsLng,
          }),
          description: `${type === 'credit' ? 'Credit posted' : 'Recovery submitted (pending approval)'}: Rs. ${amount} at ${shop.name}`,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({ ...transaction, creditLimitWarning, warnings: warnings.length > 0 ? warnings : undefined }, { status: 201 });
  } catch (error) {
    console.error('Error creating transaction:', error);
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }
}

// PATCH /api/transactions - Edit a transaction (amount, description)
// Reverses the old transaction's effect, applies the new one, updates shop balance
export async function PATCH(request: NextRequest) {
  try {
    const { id, amount, description, updatedBy } = await request.json();

    if (!id || !amount || !updatedBy) {
      return NextResponse.json({ error: 'Transaction ID, amount, and updater are required' }, { status: 400 });
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    const existingTxn = await db.transaction.findUnique({
      where: { id },
      include: { shop: { select: { id: true, name: true, balance: true } } },
    });

    if (!existingTxn) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const shop = existingTxn.shop;
    const oldAmount = existingTxn.amount;
    const oldType = existingTxn.type;
    const newAmount = amount;

    // Step 1: Reverse old transaction's effect on shop balance
    let balanceAfterReverse: number;
    if (oldType === 'credit') {
      balanceAfterReverse = shop.balance - oldAmount; // undo credit
    } else {
      balanceAfterReverse = shop.balance + oldAmount; // undo recovery
    }

    // Step 2: Apply new amount
    let newShopBalance: number;
    if (oldType === 'credit') {
      newShopBalance = balanceAfterReverse + newAmount;
    } else {
      newShopBalance = balanceAfterReverse - newAmount;
    }

    newShopBalance = Math.round(newShopBalance * 100) / 100;

    // Step 3: Update in transaction
    const updatedTxn = await db.$transaction(async (tx) => {
      const txn = await tx.transaction.update({
        where: { id },
        data: {
          amount: newAmount,
          description: description !== undefined ? description : existingTxn.description,
          newBalance: newShopBalance,
        },
        include: {
          shop: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
        },
      });

      await tx.shop.update({
        where: { id: shop.id },
        data: { balance: newShopBalance },
      });

      return txn;
    });

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          action: 'edit',
          entityType: 'transaction',
          entityId: id,
          performedBy: updatedBy,
          oldValue: JSON.stringify({
            shopName: shop.name,
            type: oldType,
            amount: oldAmount,
            description: existingTxn.description,
          }),
          newValue: JSON.stringify({
            shopName: shop.name,
            type: oldType,
            amount: newAmount,
            description: description !== undefined ? description : existingTxn.description,
          }),
          description: `Transaction edited: ${oldType} Rs. ${oldAmount} → Rs. ${newAmount} at ${shop.name}`,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json(updatedTxn);
  } catch (error) {
    console.error('Error updating transaction:', error);
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
  }
}

// DELETE /api/transactions - Delete a transaction and reverse its effect on shop balance
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const deletedBy = searchParams.get('deletedBy');

    if (!id || !deletedBy) {
      return NextResponse.json({ error: 'Transaction ID and deleter are required' }, { status: 400 });
    }

    const existingTxn = await db.transaction.findUnique({
      where: { id },
      include: { shop: { select: { id: true, name: true, balance: true } } },
    });

    if (!existingTxn) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const shop = existingTxn.shop;

    // Reverse the effect on shop balance
    let newShopBalance: number;
    if (existingTxn.type === 'credit') {
      newShopBalance = shop.balance - existingTxn.amount;
    } else {
      newShopBalance = shop.balance + existingTxn.amount;
    }

    newShopBalance = Math.round(newShopBalance * 100) / 100;

    // Delete in transaction
    await db.$transaction(async (tx) => {
      await tx.transaction.delete({ where: { id } });
      await tx.shop.update({
        where: { id: shop.id },
        data: { balance: newShopBalance },
      });
    });

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          action: 'delete',
          entityType: 'transaction',
          entityId: id,
          performedBy: deletedBy,
          oldValue: JSON.stringify({
            shopName: shop.name,
            type: existingTxn.type,
            amount: existingTxn.amount,
            previousBalance: existingTxn.previousBalance,
            newBalance: existingTxn.newBalance,
            description: existingTxn.description,
          }),
          newValue: JSON.stringify({ shopName: shop.name, newBalance: newShopBalance }),
          description: `Transaction deleted: ${existingTxn.type} Rs. ${existingTxn.amount} at ${shop.name}`,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true, deletedId: id, newShopBalance });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }
}
