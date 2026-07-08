import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getPool } from '@/lib/pg';
import { recalcShopBalances } from '@/lib/recalc-balances';

// POST /api/transactions/claim
// Post a claim (balance deduction) for a shop — e.g. expiry stock return
// Body: { shopId, amount, description, companyId }
// companyId is REQUIRED — claims must be attributed to a specific company
// to keep ShopCompanyBalance in sync with Shop.balance.
export async function POST(request: NextRequest) {
  try {
    const createdBy = request.headers.get('x-auth-userid');
    const { shopId, amount, description, companyId, customDate } = await request.json();

    // Validate required fields
    if (!shopId || !amount || !createdBy) {
      return NextResponse.json(
        { error: 'shopId, amount, and authentication are required' },
        { status: 400 }
      );
    }

    // FIX C5: companyId is now REQUIRED for claims
    if (!companyId) {
      return NextResponse.json(
        { error: 'Company selection is required for claims. Please select a company before posting a claim.' },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Claim amount must be greater than 0' },
        { status: 400 }
      );
    }

    // Validate customDate if provided (allow back-dating but not future dates)
    let customCreatedAt: Date | null = null;
    if (customDate) {
      const parsed = new Date(customDate);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'Invalid custom date format. Use YYYY-MM-DD or ISO string.' },
          { status: 400 }
        );
      }
      // Disallow future dates
      if (parsed.getTime() > Date.now() + 60 * 1000) {
        return NextResponse.json(
          { error: 'Custom date cannot be in the future.' },
          { status: 400 }
        );
      }
      customCreatedAt = parsed;
    }

    // Fetch current shop with balance
    const shop = await db.shop.findUnique({
      where: { id: shopId },
      include: {
        orderbooker: { select: { id: true, name: true } },
        companyBalances: {
          where: { companyId },
        },
      },
    });

    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Deduct from company-specific balance
    const companyBalance = shop.companyBalances.find(
      (cb: any) => cb.companyId === companyId
    );
    const previousBalance = companyBalance ? Number(companyBalance.balance) : 0;

    if (previousBalance < amount) {
      return NextResponse.json(
        { error: `Insufficient balance. Current company balance: ${previousBalance}, Claim amount: ${amount}` },
        { status: 400 }
      );
    }

    const newBalance = previousBalance - amount;

    // Create claim transaction and update balance in a transaction
    const result = await db.$transaction(async (tx: any) => {
      // 1. Create the claim transaction (with optional custom date for back-dating)
      const claim = await tx.transaction.create({
        data: {
          shopId,
          type: 'claim',
          status: 'approved',
          amount,
          previousBalance,
          newBalance,
          description: description || 'Claim posting',
          createdBy,
          companyId,
          ...(customCreatedAt ? { createdAt: customCreatedAt } : {}),
        },
      });

      // 2. Update the ShopCompanyBalance
      if (companyBalance) {
        await tx.shopCompanyBalance.update({
          where: { shopId_companyId: { shopId, companyId } },
          data: { balance: newBalance },
        });
      } else {
        // Create new SCB entry if it doesn't exist
        await tx.shopCompanyBalance.create({
          data: {
            shopId,
            companyId,
            balance: newBalance,
            creditLimit: 0,
          },
        });
      }

      // 3. Update the main shop balance
      const mainNewBalance = Number(shop.balance) - amount;
      await tx.shop.update({
        where: { id: shopId },
        data: { balance: mainNewBalance },
      });

      // 4. Audit log (INSIDE transaction — C6 fix)
      await tx.auditLog.create({
        data: {
          action: 'claim_post',
          entityType: 'transaction',
          entityId: claim.id,
          performedBy: createdBy,
          newValue: JSON.stringify({ type: 'claim', amount, shopId, companyId, description }),
          description: `Claim posted: Rs. ${amount.toLocaleString()} for shop "${shop.name}"`,
        },
      });

      return claim;
    });

    // 5. Recalc balances to ensure everything is in sync
    // (run AFTER Prisma transaction commits, using pg client)
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await recalcShopBalances(client, shopId);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    } catch (recalcErr) {
      console.error('[claim] Recalc failed (non-blocking):', recalcErr);
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error posting claim:', error);
    return NextResponse.json(
      { error: `Failed to post claim: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
