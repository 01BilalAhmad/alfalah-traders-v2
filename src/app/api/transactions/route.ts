import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';
import crypto from 'crypto';

// Business rule constants
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500000;
const DAILY_CREDIT_CAP = 500000;

// Helper: Convert a date string (YYYY-MM-DD) to Pakistan timezone boundaries
function getPakistanDayRange(dateStr: string): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -5, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));
  return { start, end };
}

// GET /api/transactions?shopId=xxx&orderbookerId=xxx&date=xxx&startDate=xxx&type=xxx
export async function GET(request: NextRequest) {
  let client;
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
    const companyId = searchParams.get('companyId');
    const status = searchParams.get('status');

    client = getPgClient();
    await client.connect();

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (shopId) {
      conditions.push(`t."shopId" = $${paramIndex++}`);
      params.push(shopId);
    }
    if (type) {
      conditions.push(`t.type = $${paramIndex++}`);
      params.push(type);
    }
    if (createdBy) {
      conditions.push(`t."createdBy" = $${paramIndex++}`);
      params.push(createdBy);
    }
    if (status) {
      conditions.push(`t.status = $${paramIndex++}`);
      params.push(status);
    }
    if (companyId) {
      conditions.push(`t."companyId" = $${paramIndex++}`);
      params.push(companyId);
    }
    if (orderbookerId) {
      conditions.push(`s."orderbookerId" = $${paramIndex++}`);
      params.push(orderbookerId);
    }
    if (date) {
      const { start, end } = getPakistanDayRange(date);
      conditions.push(`t."createdAt" >= $${paramIndex++}`);
      params.push(start.toISOString());
      conditions.push(`t."createdAt" <= $${paramIndex++}`);
      params.push(end.toISOString());
    } else if (startDate) {
      const { start } = getPakistanDayRange(startDate);
      conditions.push(`t."createdAt" >= $${paramIndex++}`);
      params.push(start.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countRes = await client.query(
      `SELECT COUNT(*) FROM "Transaction" t LEFT JOIN "Shop" s ON t."shopId" = s.id ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    // Fetch paginated transactions
    const offset = (page - 1) * limit;
    const txnRes = await client.query(
      `SELECT t.*, s.id AS "shop_id", s.name AS "shop_name", s.area AS "shop_area",
              c.id AS "creator_id", c.name AS "creator_name", c.role AS "creator_role",
              co.id AS "company_id", co.name AS "company_name"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       LEFT JOIN "User" c ON t."createdBy" = c.id
       LEFT JOIN "Company" co ON t."companyId" = co.id
       ${whereClause}
       ORDER BY t."createdAt" DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    const transactions = txnRes.rows.map((t: any) => ({
      id: t.id,
      shopId: t.shopId,
      type: t.type,
      status: t.status,
      amount: Number(t.amount),
      previousBalance: Number(t.previousBalance),
      newBalance: Number(t.newBalance),
      description: t.description,
      createdBy: t.createdBy,
      approvedBy: t.approvedBy,
      approvedAt: t.approvedAt,
      rejectReason: t.rejectReason,
      gpsLat: t.gpsLat,
      gpsLng: t.gpsLng,
      gpsAddress: t.gpsAddress,
      companyId: t.companyId || null,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
      shop: {
        id: t.shop_id,
        name: t.shop_name,
        area: t.shop_area,
      },
      creator: {
        id: t.creator_id,
        name: t.creator_name,
        role: t.creator_role,
      },
      company: t.company_id ? {
        id: t.company_id,
        name: t.company_name,
      } : null,
    }));

    await client.end();
    return NextResponse.json({
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error fetching transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}

// POST /api/transactions - Create a transaction (credit or recovery)
export async function POST(request: NextRequest) {
  let client;
  try {
    const { shopId, type, amount, description, createdBy, gpsLat, gpsLng, gpsAddress, companyId } = await request.json();

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

    client = getPgClient();
    await client.connect();

    // Start a transaction for atomicity
    await client.query('BEGIN');

    const shopRes = await client.query('SELECT * FROM "Shop" WHERE id = $1', [shopId]);
    if (shopRes.rows.length === 0) {
      await client.query('ROLLBACK');
      await client.end();
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }
    const shop = shopRes.rows[0];

    // Validate companyId if provided (after client connect)
    if (companyId) {
      try {
        const companyRes = await client.query('SELECT id, status FROM "Company" WHERE id = $1', [companyId]);
        if (companyRes.rows.length === 0) {
          await client.query('ROLLBACK');
          await client.end();
          return NextResponse.json({ error: 'Company not found' }, { status: 400 });
        }
        if (companyRes.rows[0].status === 'inactive') {
          await client.query('ROLLBACK');
          await client.end();
          return NextResponse.json({ error: 'Cannot post to inactive company' }, { status: 400 });
        }
      } catch {
        // If Company table doesn't exist yet, just proceed
      }
    }

    // Validation 4: For credit type, check if shop is active
    if (type === 'credit' && shop.status !== 'active') {
      await client.query('ROLLBACK');
      await client.end();
      return NextResponse.json({ error: `Cannot post credit to inactive shop "${shop.name}". Activate the shop first.` }, { status: 400 });
    }

    // Validation 5: For recovery type, cannot recover more than shop balance
    if (type === 'recovery' && amount > Number(shop.balance)) {
      await client.query('ROLLBACK');
      await client.end();
      return NextResponse.json({
        error: `Recovery amount (Rs. ${amount.toLocaleString()}) exceeds shop balance (Rs. ${Number(shop.balance).toLocaleString()}). Maximum recovery allowed: Rs. ${Number(shop.balance).toLocaleString()}`,
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

      const creditSumRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM "Transaction" WHERE "shopId" = $1 AND type = 'credit' AND "createdAt" >= $2 AND "createdAt" <= $3`,
        [shopId, dayStart.toISOString(), dayEnd.toISOString()]
      );
      const todayCreditTotal = Number(creditSumRes.rows[0].total);

      if (todayCreditTotal + amount > DAILY_CREDIT_CAP) {
        await client.query('ROLLBACK');
        await client.end();
        return NextResponse.json({
          error: `Daily credit cap exceeded for this shop. Today's total: Rs. ${todayCreditTotal.toLocaleString()}, this entry: Rs. ${amount.toLocaleString()}, combined: Rs. ${(todayCreditTotal + amount).toLocaleString()} (limit: Rs. ${DAILY_CREDIT_CAP.toLocaleString()})`,
        }, { status: 400 });
      }

      // Validation 7: Check if shop's orderbooker is active (warning only)
      if (shop.orderbookerId) {
        try {
          const obRes = await client.query(
            `SELECT id, name, status FROM "User" WHERE id = $1`,
            [shop.orderbookerId]
          );
          if (obRes.rows.length > 0 && obRes.rows[0].status === 'inactive') {
            warnings.push(`The assigned orderbooker (${obRes.rows[0].name}) is currently inactive. Credit has been posted with a warning.`);
          }
        } catch {
          // Non-blocking
        }
      }
    }

    const previousBalance = Number(shop.balance);
    let newBalance: number;

    if (type === 'credit') {
      newBalance = previousBalance + amount;
    } else {
      // Recovery: if pending approval mode, don't deduct balance yet
      newBalance = previousBalance;
    }

    // Check credit limit warning for credit transactions
    let creditLimitWarning: { limit: number; currentBalance: number; exceeded: boolean } | null = null;
    if (type === 'credit' && shop.creditLimit && Number(shop.creditLimit) > 0) {
      const projectedBalance = previousBalance + amount;
      creditLimitWarning = {
        limit: Number(shop.creditLimit),
        currentBalance: Math.round(projectedBalance * 100) / 100,
        exceeded: projectedBalance > Number(shop.creditLimit),
      };
    }

    // Recovery status: pending (awaiting admin approval)
    const txnStatus = type === 'recovery' ? 'pending' : 'approved';

    // Create transaction record
    const txnId = `txn_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
    const txnRes = await client.query(
      `INSERT INTO "Transaction" (id, "shopId", type, status, amount, "previousBalance", "newBalance", description, "createdBy", "gpsLat", "gpsLng", "gpsAddress", "companyId", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [txnId, shopId, type, txnStatus, amount, previousBalance, Math.round(newBalance * 100) / 100, description || null, createdBy, gpsLat || null, gpsLng || null, gpsAddress || null, companyId || null, new Date().toISOString()]
    );

    const transaction = txnRes.rows[0];

    // Update shop balance only for credit transactions
    if (type === 'credit') {
      await client.query(
        `UPDATE "Shop" SET balance = $1 WHERE id = $2`,
        [Math.round(newBalance * 100) / 100, shopId]
      );

      // Update ShopCompanyBalance if companyId is provided
      if (companyId) {
        try {
          // Get current company balance for this shop
          const scbRes = await client.query(
            `SELECT id, balance, "creditLimit" FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND "companyId" = $2`,
            [shopId, companyId]
          );

          if (scbRes.rows.length > 0) {
            // Update existing balance
            const currentCompanyBalance = Number(scbRes.rows[0].balance);
            const newCompanyBalance = Math.round((currentCompanyBalance + amount) * 100) / 100;
            await client.query(
              `UPDATE "ShopCompanyBalance" SET balance = $1, "updatedAt" = $2 WHERE id = $3`,
              [newCompanyBalance, new Date().toISOString(), scbRes.rows[0].id]
            );
          } else {
            // Create new ShopCompanyBalance entry
            const scbId = `scb_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
            await client.query(
              `INSERT INTO "ShopCompanyBalance" (id, "shopId", "companyId", balance, "creditLimit", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [scbId, shopId, companyId, Math.round(amount * 100) / 100, 0, new Date().toISOString(), new Date().toISOString()]
            );
          }
        } catch (scbErr) {
          // ShopCompanyBalance table might not exist yet - non-blocking
          console.warn('ShopCompanyBalance update failed (table may not exist yet):', scbErr);
        }
      }
    }

    await client.query('COMMIT');

    // Create audit log (best-effort)
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await client.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "performedBy", "newValue", description)
         VALUES ($1, $2, 'transaction', $3, $4, $5, $6)`,
        [
          auditId,
          type === 'credit' ? 'credit_post' : 'recovery_entry',
          transaction.id,
          createdBy,
          JSON.stringify({
            shopName: shop.name,
            type,
            amount,
            previousBalance,
            newBalance: Math.round(newBalance * 100) / 100,
            gpsLat,
            gpsLng,
          }),
          `${type === 'credit' ? 'Credit posted' : 'Recovery submitted (pending approval)'}: Rs. ${amount} at ${shop.name}`,
        ]
      );
    } catch { /* non-blocking */ }

    // Fetch shop and creator info for response
    const shopInfoRes = await client.query('SELECT id, name FROM "Shop" WHERE id = $1', [shopId]);
    const creatorInfoRes = await client.query('SELECT id, name FROM "User" WHERE id = $1', [createdBy]);

    await client.end();

    // Fetch company name if companyId provided
    let companyInfo: { id: string; name: string } | null = null;
    if (companyId) {
      try {
        const companyInfoRes = await client.query('SELECT id, name FROM "Company" WHERE id = $1', [companyId]);
        if (companyInfoRes.rows.length > 0) {
          companyInfo = { id: companyInfoRes.rows[0].id, name: companyInfoRes.rows[0].name };
        }
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({
      ...transaction,
      amount: Number(transaction.amount),
      previousBalance: Number(transaction.previousBalance),
      newBalance: Number(transaction.newBalance),
      companyId: transaction.companyId || null,
      shop: { id: shopInfoRes.rows[0]?.id, name: shopInfoRes.rows[0]?.name },
      creator: { id: creatorInfoRes.rows[0]?.id, name: creatorInfoRes.rows[0]?.name },
      company: companyInfo,
      creditLimitWarning,
      warnings: warnings.length > 0 ? warnings : undefined,
    }, { status: 201 });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
      await client.end().catch(() => {});
    }
    console.error('Error creating transaction:', error);
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }
}

// PATCH /api/transactions - Edit a transaction (amount, description, and/or company change)
export async function PATCH(request: NextRequest) {
  let client;
  try {
    const { id, amount, description, updatedBy, newCompanyId } = await request.json();

    if (!id || !updatedBy) {
      return NextResponse.json({ error: 'Transaction ID and updater are required' }, { status: 400 });
    }

    // At least one of amount or newCompanyId must be provided
    if (!amount && !newCompanyId && newCompanyId !== null) {
      return NextResponse.json({ error: 'At least amount or newCompanyId must be provided' }, { status: 400 });
    }

    if (amount !== undefined && amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    client = getPgClient();
    await client.connect();

    await client.query('BEGIN');

    // Fetch existing transaction with shop
    const existingRes = await client.query(
      `SELECT t.*, s.id AS "shop_db_id", s.name AS "shop_name", s.balance AS "shop_balance"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       WHERE t.id = $1`,
      [id]
    );

    if (existingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      await client.end();
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const existingTxn = existingRes.rows[0];
    const oldAmount = Number(existingTxn.amount);
    const oldType = existingTxn.type;
    const oldCompanyId = existingTxn.companyId || null;
    const finalAmount = amount || oldAmount;
    const shopBalance = Number(existingTxn.shop_balance);
    const isApproved = existingTxn.status === 'approved';

    // === Handle company change ===
    let companyChanged = false;
    const effectiveNewCompanyId = newCompanyId !== undefined ? newCompanyId : oldCompanyId;

    if (newCompanyId !== undefined && newCompanyId !== oldCompanyId) {
      companyChanged = true;

      // Validate new company exists and is active
      if (newCompanyId !== null) {
        try {
          const companyRes = await client.query('SELECT id, status FROM "Company" WHERE id = $1', [newCompanyId]);
          if (companyRes.rows.length === 0) {
            await client.query('ROLLBACK');
            await client.end();
            return NextResponse.json({ error: 'New company not found' }, { status: 400 });
          }
          if (companyRes.rows[0].status === 'inactive') {
            await client.query('ROLLBACK');
            await client.end();
            return NextResponse.json({ error: 'Cannot transfer to an inactive company' }, { status: 400 });
          }
        } catch {
          // Company table might not exist - proceed
        }
      }

      // Adjust ShopCompanyBalance for approved transactions
      if (isApproved && (oldType === 'credit' || oldType === 'recovery')) {
        const txnAmount = oldAmount;

        // 1. Subtract from old company balance (if old company existed)
        if (oldCompanyId) {
          try {
            const oldScbRes = await client.query(
              `SELECT id, balance FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND "companyId" = $2`,
              [existingTxn.shopId, oldCompanyId]
            );
            if (oldScbRes.rows.length > 0) {
              const currentOldBalance = Number(oldScbRes.rows[0].balance);
              let adjustedOldBalance: number;
              if (oldType === 'credit') {
                // Credit added to balance, so reverse = subtract
                adjustedOldBalance = currentOldBalance - txnAmount;
              } else {
                // Recovery deducted from balance, so reverse = add back
                adjustedOldBalance = currentOldBalance + txnAmount;
              }
              adjustedOldBalance = Math.round(adjustedOldBalance * 100) / 100;

              if (adjustedOldBalance <= 0) {
                // Remove the ShopCompanyBalance entry if balance is zero or negative
                await client.query(
                  `DELETE FROM "ShopCompanyBalance" WHERE id = $1`,
                  [oldScbRes.rows[0].id]
                );
              } else {
                await client.query(
                  `UPDATE "ShopCompanyBalance" SET balance = $1, "updatedAt" = $2 WHERE id = $3`,
                  [adjustedOldBalance, new Date().toISOString(), oldScbRes.rows[0].id]
                );
              }
            }
          } catch (scbErr) {
            console.warn('Old ShopCompanyBalance adjustment failed:', scbErr);
          }
        }

        // 2. Add to new company balance (if new company is provided)
        if (newCompanyId) {
          try {
            const newScbRes = await client.query(
              `SELECT id, balance FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND "companyId" = $2`,
              [existingTxn.shopId, newCompanyId]
            );
            if (newScbRes.rows.length > 0) {
              const currentNewBalance = Number(newScbRes.rows[0].balance);
              let adjustedNewBalance: number;
              if (oldType === 'credit') {
                adjustedNewBalance = currentNewBalance + txnAmount;
              } else {
                adjustedNewBalance = currentNewBalance - txnAmount;
              }
              adjustedNewBalance = Math.round(adjustedNewBalance * 100) / 100;
              await client.query(
                `UPDATE "ShopCompanyBalance" SET balance = $1, "updatedAt" = $2 WHERE id = $3`,
                [adjustedNewBalance, new Date().toISOString(), newScbRes.rows[0].id]
              );
            } else {
              // Create new ShopCompanyBalance entry
              const scbId = `scb_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
              let initialBalance: number;
              if (oldType === 'credit') {
                initialBalance = txnAmount;
              } else {
                initialBalance = -txnAmount; // Recovery on a new company entry (rare but possible)
              }
              initialBalance = Math.round(initialBalance * 100) / 100;
              await client.query(
                `INSERT INTO "ShopCompanyBalance" (id, "shopId", "companyId", balance, "creditLimit", "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [scbId, existingTxn.shopId, newCompanyId, initialBalance, 0, new Date().toISOString(), new Date().toISOString()]
              );
            }
          } catch (scbErr) {
            console.warn('New ShopCompanyBalance adjustment failed:', scbErr);
          }
        }
      }
    }

    // === Handle amount change (existing logic, but also update ShopCompanyBalance) ===
    let newShopBalance = shopBalance;

    if (finalAmount !== oldAmount) {
      // Step 1: Reverse old transaction's effect on shop balance
      let balanceAfterReverse: number;
      if (oldType === 'credit') {
        balanceAfterReverse = shopBalance - oldAmount;
      } else {
        balanceAfterReverse = shopBalance + oldAmount;
      }

      // Step 2: Apply new amount
      if (oldType === 'credit') {
        newShopBalance = balanceAfterReverse + finalAmount;
      } else {
        newShopBalance = balanceAfterReverse - finalAmount;
      }
      newShopBalance = Math.round(newShopBalance * 100) / 100;

      // Update shop balance
      await client.query(
        `UPDATE "Shop" SET balance = $1 WHERE id = $2`,
        [newShopBalance, existingTxn.shopId]
      );

      // Update ShopCompanyBalance for amount change (if approved and has company)
      if (isApproved && effectiveNewCompanyId) {
        try {
          const scbRes = await client.query(
            `SELECT id, balance FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND "companyId" = $2`,
            [existingTxn.shopId, effectiveNewCompanyId]
          );
          if (scbRes.rows.length > 0) {
            const currentScbBalance = Number(scbRes.rows[0].balance);
            let adjustedScbBalance: number;
            if (oldType === 'credit') {
              adjustedScbBalance = currentScbBalance - oldAmount + finalAmount;
            } else {
              adjustedScbBalance = currentScbBalance + oldAmount - finalAmount;
            }
            adjustedScbBalance = Math.round(adjustedScbBalance * 100) / 100;
            await client.query(
              `UPDATE "ShopCompanyBalance" SET balance = $1, "updatedAt" = $2 WHERE id = $3`,
              [adjustedScbBalance, new Date().toISOString(), scbRes.rows[0].id]
            );
          }
        } catch (scbErr) {
          console.warn('ShopCompanyBalance amount adjustment failed:', scbErr);
        }
      }
    }

    // Update transaction record
    const newDesc = description !== undefined ? description : existingTxn.description;
    const updatedTxnRes = await client.query(
      `UPDATE "Transaction" SET amount = $1, description = $2, "newBalance" = $3, "companyId" = $4 WHERE id = $5 RETURNING *`,
      [finalAmount, newDesc, newShopBalance, effectiveNewCompanyId, id]
    );
    const updatedTxn = updatedTxnRes.rows[0];

    await client.query('COMMIT');

    // Audit log
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      const oldVal: Record<string, unknown> = {
        shopName: existingTxn.shop_name,
        type: oldType,
        amount: oldAmount,
        description: existingTxn.description,
      };
      const newVal: Record<string, unknown> = {
        shopName: existingTxn.shop_name,
        type: oldType,
        amount: finalAmount,
        description: newDesc,
      };

      if (companyChanged) {
        // Fetch company names for audit
        let oldCompanyName = oldCompanyId;
        let newCompanyName = effectiveNewCompanyId;
        try {
          if (oldCompanyId) {
            const oldCoRes = await client.query('SELECT name FROM "Company" WHERE id = $1', [oldCompanyId]);
            if (oldCoRes.rows.length > 0) oldCompanyName = oldCoRes.rows[0].name;
          }
          if (effectiveNewCompanyId) {
            const newCoRes = await client.query('SELECT name FROM "Company" WHERE id = $1', [effectiveNewCompanyId]);
            if (newCoRes.rows.length > 0) newCompanyName = newCoRes.rows[0].name;
          }
        } catch { /* non-blocking */ }
        oldVal.companyId = oldCompanyId;
        oldVal.companyName = oldCompanyName;
        newVal.companyId = effectiveNewCompanyId;
        newVal.companyName = newCompanyName;
      }

      await client.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "performedBy", "oldValue", "newValue", description)
         VALUES ($1, $2, 'transaction', $3, $4, $5, $6, $7)`,
        [
          auditId,
          companyChanged ? 'company_change' : 'edit',
          id,
          updatedBy,
          JSON.stringify(oldVal),
          JSON.stringify(newVal),
          companyChanged
            ? `Company changed for ${oldType} Rs. ${oldAmount} at ${existingTxn.shop_name}: ${oldVal.companyName || 'None'} → ${newVal.companyName || 'None'}`
            : `Transaction edited: ${oldType} Rs. ${oldAmount} → Rs. ${finalAmount} at ${existingTxn.shop_name}`,
        ]
      );
    } catch { /* non-blocking */ }

    // Fetch shop, creator, and company for response
    const shopInfoRes = await client.query('SELECT id, name FROM "Shop" WHERE id = $1', [existingTxn.shopId]);
    const creatorInfoRes = await client.query('SELECT id, name FROM "User" WHERE id = $1', [existingTxn.createdBy]);

    let companyInfo: { id: string; name: string } | null = null;
    if (effectiveNewCompanyId) {
      try {
        const companyInfoRes = await client.query('SELECT id, name FROM "Company" WHERE id = $1', [effectiveNewCompanyId]);
        if (companyInfoRes.rows.length > 0) {
          companyInfo = { id: companyInfoRes.rows[0].id, name: companyInfoRes.rows[0].name };
        }
      } catch { /* non-blocking */ }
    }

    await client.end();
    return NextResponse.json({
      ...updatedTxn,
      amount: Number(updatedTxn.amount),
      previousBalance: Number(updatedTxn.previousBalance),
      newBalance: Number(updatedTxn.newBalance),
      companyId: effectiveNewCompanyId,
      shop: { id: shopInfoRes.rows[0]?.id, name: shopInfoRes.rows[0]?.name },
      creator: { id: creatorInfoRes.rows[0]?.id, name: creatorInfoRes.rows[0]?.name },
      company: companyInfo,
    });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
      await client.end().catch(() => {});
    }
    console.error('Error updating transaction:', error);
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
  }
}

// DELETE /api/transactions - Delete a transaction and reverse its effect on shop balance
export async function DELETE(request: NextRequest) {
  let client;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const deletedBy = searchParams.get('deletedBy');

    if (!id || !deletedBy) {
      return NextResponse.json({ error: 'Transaction ID and deleter are required' }, { status: 400 });
    }

    client = getPgClient();
    await client.connect();

    await client.query('BEGIN');

    const existingRes = await client.query(
      `SELECT t.*, s.id AS "shop_db_id", s.name AS "shop_name", s.balance AS "shop_balance"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       WHERE t.id = $1`,
      [id]
    );

    if (existingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      await client.end();
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const existingTxn = existingRes.rows[0];
    const shopBalance = Number(existingTxn.shop_balance);

    // Reverse the effect on shop balance
    let newShopBalance: number;
    if (existingTxn.type === 'credit') {
      newShopBalance = shopBalance - Number(existingTxn.amount);
    } else {
      newShopBalance = shopBalance + Number(existingTxn.amount);
    }

    newShopBalance = Math.round(newShopBalance * 100) / 100;

    // Delete transaction
    await client.query('DELETE FROM "Transaction" WHERE id = $1', [id]);

    // Update shop balance
    await client.query(
      `UPDATE "Shop" SET balance = $1 WHERE id = $2`,
      [newShopBalance, existingTxn.shopId]
    );

    await client.query('COMMIT');

    // Audit log
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await client.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "performedBy", "oldValue", "newValue", description)
         VALUES ($1, 'delete', 'transaction', $2, $3, $4, $5, $6)`,
        [
          auditId,
          id,
          deletedBy,
          JSON.stringify({
            shopName: existingTxn.shop_name,
            type: existingTxn.type,
            amount: Number(existingTxn.amount),
            previousBalance: Number(existingTxn.previousBalance),
            newBalance: Number(existingTxn.newBalance),
            description: existingTxn.description,
          }),
          JSON.stringify({ shopName: existingTxn.shop_name, newBalance: newShopBalance }),
          `Transaction deleted: ${existingTxn.type} Rs. ${Number(existingTxn.amount)} at ${existingTxn.shop_name}`,
        ]
      );
    } catch { /* non-blocking */ }

    await client.end();
    return NextResponse.json({ success: true, deletedId: id, newShopBalance });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
      await client.end().catch(() => {});
    }
    console.error('Error deleting transaction:', error);
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }
}
