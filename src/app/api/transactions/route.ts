import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';
import crypto from 'crypto';
import { recalcShopBalances } from '@/lib/recalc-balances';

// Business rule constants
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500000;
// Daily credit cap is now a WARNING only (not a hard block) — admin can override
// Client-side shows a confirmation dialog; server just adds a warning
const DAILY_CREDIT_CAP = 100000;

// Helper: Convert a date string (YYYY-MM-DD) to Pakistan timezone boundaries
function getPakistanDayRange(dateStr: string): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -5, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));
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
    const companyId = searchParams.get('companyId');
    const status = searchParams.get('status');

    const pool = getPool();

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
    if (status === 'rejected') {
      // Explicitly requesting rejected transactions — show only rejected
      conditions.push(`t.status = $${paramIndex++}`);
      params.push('rejected');
    } else if (status === 'pending') {
      // Explicitly requesting pending transactions
      conditions.push(`t.status = $${paramIndex++}`);
      params.push('pending');
    } else if (status === 'approved') {
      // Explicitly requesting approved transactions
      conditions.push(`t.status = $${paramIndex++}`);
      params.push('approved');
    } else {
      // Default: exclude rejected transactions (show approved + pending only)
      conditions.push(`t.status != 'rejected'`);
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
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM "Transaction" t LEFT JOIN "Shop" s ON t."shopId" = s.id ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    // Fetch paginated transactions
    const offset = (page - 1) * limit;
    const txnRes = await pool.query(
      `SELECT t.*, s.id AS "shop_id", s.name AS "shop_name", s.area AS "shop_area", s."ownerName" AS "shop_ownerName",
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
        ownerName: t.shop_ownerName || null,
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
    // SECURITY: Use authenticated user ID from proxy header, not from request body
    const authUserId = request.headers.get('x-auth-userid');
    const { shopId, type, amount, description, gpsLat, gpsLng, gpsAddress, companyId, idempotencyKey, customDate } = await request.json();
    const createdBy = authUserId || request.headers.get('x-auth-userid'); // fallback for safety

    if (!shopId || !type || !amount || !createdBy) {
      return NextResponse.json({ error: 'Shop, type, amount, and creator are required' }, { status: 400 });
    }

    // Idempotency check: if idempotencyKey is provided, check for existing transaction
    // SECURITY: This is the PRIMARY duplicate prevention mechanism.
    // The try/catch is kept ONLY for backward-compatibility with very old DBs
    // that don't have the idempotencyKey column yet. In normal operation the
    // column exists (added via Prisma schema) so the check always runs.
    if (idempotencyKey) {
      try {
        const pool = getPool();
        const existingRes = await pool.query(
          'SELECT * FROM "Transaction" WHERE "idempotencyKey" = $1',
          [idempotencyKey]
        );
        if (existingRes.rows.length > 0) {
          // Return the existing transaction — this is a duplicate submission
          const existing = existingRes.rows[0];
          console.log(`[Transactions] Idempotent hit: key=${idempotencyKey}, existing tx=${existing.id}`);
          return NextResponse.json({
            ...existing,
            amount: Number(existing.amount),
            previousBalance: Number(existing.previousBalance),
            newBalance: Number(existing.newBalance),
            _idempotent: true, // Flag to indicate this was a duplicate
          }, { status: 200 });
        }
      } catch (idempotencyErr) {
        // Log the error so we know the column is missing — but DON'T silently skip
        console.error('[Transactions] Idempotency check failed (column may not exist):', idempotencyErr);
      }
    }

    // ── Same-day duplicate prevention (BACKUP LAYER) ──────────────
    // Even if idempotencyKey is missing/different, prevent duplicates by checking
    // if the SAME orderbooker submitted the SAME amount for the SAME shop on the
    // SAME calendar day. This catches the "online then offline" double-submit bug.
    if (type === 'recovery') {
      try {
        const pool = getPool();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const dupCheckRes = await pool.query(
          `SELECT * FROM "Transaction"
           WHERE "shopId" = $1
             AND "createdBy" = $2
             AND type = 'recovery'
             AND amount = $3
             AND status != 'rejected'
             AND "createdAt" >= $4
             AND "createdAt" <= $5
           ORDER BY "createdAt" DESC
           LIMIT 1`,
          [shopId, createdBy, amount, todayStart.toISOString(), todayEnd.toISOString()]
        );

        if (dupCheckRes.rows.length > 0) {
          // Same shop + same OB + same amount + same day → duplicate!
          const existing = dupCheckRes.rows[0];
          console.log(`[Transactions] Same-day duplicate prevented: shop=${shopId}, OB=${createdBy}, amount=${amount}, existing tx=${existing.id}`);
          return NextResponse.json({
            ...existing,
            amount: Number(existing.amount),
            previousBalance: Number(existing.previousBalance),
            newBalance: Number(existing.newBalance),
            _duplicate_prevented: true,
            _message: 'Same recovery already submitted today — duplicate prevented',
          }, { status: 200 });
        }
      } catch (dupCheckErr) {
        console.error('[Transactions] Same-day duplicate check failed:', dupCheckErr);
        // Non-blocking — continue with creation if check fails
      }
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

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const shopRes = await client.query('SELECT * FROM "Shop" WHERE id = $1', [shopId]);
      if (shopRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
      }
      const shop = shopRes.rows[0];

      // Validate companyId if provided (after client connect)
      if (companyId) {
        try {
          const companyRes = await client.query('SELECT id, status FROM "Company" WHERE id = $1', [companyId]);
          if (companyRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Company not found' }, { status: 400 });
          }
          if (companyRes.rows[0].status === 'inactive') {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Cannot post to inactive company' }, { status: 400 });
          }
        } catch {
          // If Company table doesn't exist yet, just proceed
        }
      }

      // Validation 4: For credit type, check if shop is active
      if (type === 'credit' && shop.status !== 'active') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: `Cannot post credit to inactive shop "${shop.name}". Activate the shop first.` }, { status: 400 });
      }

      // Validation 5: For recovery type, cannot recover more than shop balance
      if (type === 'recovery' && amount > Number(shop.balance)) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          error: `Recovery amount (Rs. ${amount.toLocaleString()}) exceeds shop balance (Rs. ${Number(shop.balance).toLocaleString()}). Maximum recovery allowed: Rs. ${Number(shop.balance).toLocaleString()}`,
        }, { status: 400 });
      }

      // Validation 6: For credit type, check daily credit cap per shop
      const warnings: string[] = [];
      if (type === 'credit') {
        // Use customDate if provided (for backdated entries), otherwise use today
        const dateToCheck = customDate || (() => {
          const today = new Date();
          return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        })();
        const [year, month, day] = dateToCheck.split('-').map(Number);
        const dayStart = new Date(Date.UTC(year, month - 1, day, -5, 0, 0, 0));
        const dayEnd = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));

        const creditSumRes = await client.query(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM "Transaction" WHERE "shopId" = $1 AND type = 'credit' AND status = 'approved' AND "createdAt" >= $2 AND "createdAt" <= $3`,
          [shopId, dayStart.toISOString(), dayEnd.toISOString()]
        );
        const todayCreditTotal = Number(creditSumRes.rows[0].total);

        // Changed from hard block to warning only — admin may need to post 8-10 lac credits
        // Client-side already shows a confirmation popup; server allows the transaction
        if (todayCreditTotal + amount > DAILY_CREDIT_CAP) {
          warnings.push(
            `Daily credit cap exceeded for this shop. Today's total: Rs. ${todayCreditTotal.toLocaleString()}, this entry: Rs. ${amount.toLocaleString()}, combined: Rs. ${(todayCreditTotal + amount).toLocaleString()} (limit: Rs. ${DAILY_CREDIT_CAP.toLocaleString()})`
          );
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

      // ─── Determine if createdBy user is an admin (for auto-approval) ───
      let creatorRole = 'orderbooker';
      try {
        const creatorRes = await client.query('SELECT id, role FROM "User" WHERE id = $1', [createdBy]);
        if (creatorRes.rows.length > 0) {
          creatorRole = creatorRes.rows[0].role || 'orderbooker';
        }
      } catch { /* non-blocking */ }

      // Admin recoveries are auto-approved (no need for another admin to approve)
      const isAdmin = creatorRole === 'admin' || creatorRole === 'super_admin';
      const txnStatus = type === 'recovery' ? (isAdmin ? 'approved' : 'pending') : 'approved';

      // If recovery and no companyId, infer from ShopCompanyBalance (highest balance first) or shop's orderbooker
      let effectiveCompanyId = companyId || null;
      if (type === 'recovery' && !effectiveCompanyId) {
        // Step 1: Prefer the company with the HIGHEST balance in ShopCompanyBalance
        // This is more reliable than the orderbooker's primary company because
        // a recovery should reduce the balance of the company that has outstanding credit
        try {
          const scbRes = await client.query(
            'SELECT "companyId" FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND balance > 0 ORDER BY balance DESC LIMIT 1',
            [shopId]
          );
          if (scbRes.rows.length > 0) {
            effectiveCompanyId = scbRes.rows[0].companyId;
          }
        } catch { /* ShopCompanyBalance table may not exist */ }

        // Step 2: Fallback to shop's orderbooker primary company only if no SCB entry
        if (!effectiveCompanyId && shop.orderbookerId) {
          try {
            const obRes = await client.query('SELECT "companyId" FROM "User" WHERE id = $1', [shop.orderbookerId]);
            if (obRes.rows.length > 0 && obRes.rows[0].companyId) {
              effectiveCompanyId = obRes.rows[0].companyId;
            }
          } catch { /* non-blocking */ }
        }
      }

      const previousBalance = Number(shop.balance);
      let newBalance: number;

      if (type === 'credit') {
        newBalance = previousBalance + amount;
      } else if (txnStatus === 'approved') {
        // Auto-approved recovery (admin): deduct balance immediately
        newBalance = previousBalance - amount;
      } else {
        // Pending recovery (orderbooker): don't deduct balance yet
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

      // Create transaction record
      const txnId = `txn_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      // Use customDate for createdAt if provided (for backdated entries)
      let createdAtIndex = new Date().toISOString();
      if (customDate) {
        // Validate: customDate must not be in the future (using Pakistan timezone)
        // Compare using Pakistan timezone boundaries to avoid UTC vs PKT mismatch
        const { end: customDayEnd } = getPakistanDayRange(customDate);
        const now = new Date();
        if (customDayEnd > now) {
          await client.query('ROLLBACK');
          return NextResponse.json({ error: 'Cannot post for a future date' }, { status: 400 });
        }
        // Use Pakistan timezone noon time for the custom date to ensure it falls in the correct day
        const [cYear, cMonth, cDay] = customDate.split('-').map(Number);
        createdAtIndex = new Date(Date.UTC(cYear, cMonth - 1, cDay, 12, 0, 0, 0)).toISOString();
      }
      const txnRes = await client.query(
        `INSERT INTO "Transaction" (id, "shopId", type, status, amount, "previousBalance", "newBalance", description, "createdBy", "gpsLat", "gpsLng", "gpsAddress", "companyId", "idempotencyKey", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [txnId, shopId, type, txnStatus, amount, previousBalance, Math.round(newBalance * 100) / 100, description || null, createdBy, gpsLat || null, gpsLng || null, gpsAddress || null, effectiveCompanyId || null, idempotencyKey || null, createdAtIndex]
      );

      const transaction = txnRes.rows[0];

      // Update shop balance for credit OR auto-approved recovery (admin)
      if (type === 'credit' || (type === 'recovery' && txnStatus === 'approved')) {
        await client.query(
          `UPDATE "Shop" SET balance = $1 WHERE id = $2`,
          [Math.round(newBalance * 100) / 100, shopId]
        );

        // Update ShopCompanyBalance if effectiveCompanyId is available
        if (effectiveCompanyId) {
          try {
            // Get current company balance for this shop
            const scbRes = await client.query(
              `SELECT id, balance, "creditLimit" FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND "companyId" = $2`,
              [shopId, effectiveCompanyId]
            );

            if (scbRes.rows.length > 0) {
              // Update existing balance
              const currentCompanyBalance = Number(scbRes.rows[0].balance);
              let newCompanyBalance: number;
              if (type === 'credit') {
                newCompanyBalance = Math.round((currentCompanyBalance + amount) * 100) / 100;
              } else {
                // Recovery: deduct from company balance
                newCompanyBalance = Math.round((currentCompanyBalance - amount) * 100) / 100;
              }
              await client.query(
                `UPDATE "ShopCompanyBalance" SET balance = $1, "updatedAt" = $2 WHERE id = $3`,
                [newCompanyBalance, new Date().toISOString(), scbRes.rows[0].id]
              );
            } else {
              // ═══ FIX H13: Create new ShopCompanyBalance entry for BOTH
              // credits AND recoveries (with negative balance for recoveries) ═══
              // Previously only credits created a new SCB entry. Recoveries
              // with no existing SCB were silently skipped, leaving
              // ShopCompanyBalance out of sync. Now recoveries also create
              // an entry (with negative balance if needed).
              const scbBalance = type === 'credit'
                ? Math.round(amount * 100) / 100
                : Math.round(-amount * 100) / 100;  // recovery → negative balance
              const scbId = `scb_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
              await client.query(
                `INSERT INTO "ShopCompanyBalance" (id, "shopId", "companyId", balance, "creditLimit", "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [scbId, shopId, effectiveCompanyId, scbBalance, 0, new Date().toISOString(), new Date().toISOString()]
              );
            }
          } catch (scbErr) {
            // ShopCompanyBalance table might not exist yet - non-blocking
            console.warn('ShopCompanyBalance update failed (table may not exist yet):', scbErr);
          }
        }
      }

      // ═══ FIX H3: Recalc is now BLOCKING ══════════════════════════════
      // Previously recalc was non-blocking (errors silently swallowed),
      // which could leave balances inconsistent. Now if recalc fails, the
      // whole transaction rolls back — better to fail loud than save wrong data.
      // The catch in the outer try will ROLLBACK and return 500 to the client.
      const recalcResult = await recalcShopBalances(client, shopId);
      console.log(`[POST /api/transactions] Recalculated shop ${shopId}: ${recalcResult.transactionsUpdated} txns, new balance Rs. ${recalcResult.newShopBalance}, ${recalcResult.companyBalancesUpdated} company balances updated`);

      // ═══ FIX C6: Audit log INSIDE the transaction (before COMMIT) ═══
      // Previously audit log was written AFTER COMMIT, so if it failed the
      // transaction was committed with NO audit trail — unacceptable for a
      // financial system. Now audit log is part of the transaction: if it
      // fails, the whole operation rolls back.
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
          `${type === 'credit' ? 'Credit posted' : txnStatus === 'approved' ? 'Recovery entered & auto-approved (admin)' : 'Recovery submitted (pending approval)'}: Rs. ${amount} at ${shop.name}`,
        ]
      );

      await client.query('COMMIT');

      // Fetch shop and creator info for response
      const shopInfoRes = await client.query('SELECT id, name FROM "Shop" WHERE id = $1', [shopId]);
      const creatorInfoRes = await client.query('SELECT id, name FROM "User" WHERE id = $1', [createdBy]);

      // Fetch company name if effectiveCompanyId is available
      let companyInfo: { id: string; name: string } | null = null;
      if (effectiveCompanyId) {
        try {
          const companyInfoRes = await client.query('SELECT id, name FROM "Company" WHERE id = $1', [effectiveCompanyId]);
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
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error creating transaction:', error);
      return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating transaction:', error);
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }
}

// PATCH /api/transactions - Edit a transaction (amount, description, and/or company change)
export async function PATCH(request: NextRequest) {
  try {
    const { id, amount, description, updatedBy, newCompanyId, gpsLat, gpsLng, gpsAddress } = await request.json();

    if (!id || !updatedBy) {
      return NextResponse.json({ error: 'Transaction ID and updater are required' }, { status: 400 });
    }

    // GPS-only update (for backfilling GPS on existing transactions)
    // ═══ FIX H10: Condition was broken — `!newCompanyId && newCompanyId !== null && newCompanyId !== undefined`
    // is only true when newCompanyId is 0/''/false (never for the normal
    // "not provided" case of undefined). Now correctly checks that BOTH
    // amount and newCompanyId are undefined (not provided).
    if (gpsLat !== undefined && gpsLng !== undefined && amount === undefined && newCompanyId === undefined) {
      try {
        const pool = getPool();
        await pool.query(
          `UPDATE "Transaction" SET "gpsLat" = $1, "gpsLng" = $2, "gpsAddress" = $3 WHERE id = $4`,
          [gpsLat, gpsLng, gpsAddress || null, id]
        );
        return NextResponse.json({ success: true, message: 'GPS coordinates updated' });
      } catch (error) {
        console.error('Error updating GPS:', error);
        return NextResponse.json({ error: 'Failed to update GPS' }, { status: 500 });
      }
    }

    // At least one of amount or newCompanyId must be provided
    if (!amount && !newCompanyId && newCompanyId !== null) {
      return NextResponse.json({ error: 'At least amount or newCompanyId must be provided' }, { status: 400 });
    }

    if (amount !== undefined && amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    // ═══ FIX H4: Amount bounds validation (same as POST) ═════════════
    // Previously PATCH only checked amount > 0, allowing amounts of 1 or
    // 99,999,999. Now apply the same MIN_AMOUNT/MAX_AMOUNT bounds as POST.
    if (amount !== undefined && amount < MIN_AMOUNT) {
      return NextResponse.json({ error: `Minimum amount is Rs. ${MIN_AMOUNT}` }, { status: 400 });
    }
    if (amount !== undefined && amount > MAX_AMOUNT) {
      return NextResponse.json({ error: `Maximum amount is Rs. ${MAX_AMOUNT.toLocaleString()}` }, { status: 400 });
    }

    const client = await getClient();
    try {
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
              return NextResponse.json({ error: 'New company not found' }, { status: 400 });
            }
            if (companyRes.rows[0].status === 'inactive') {
              await client.query('ROLLBACK');
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
                  // ═══ FIX H7: Set balance = 0 instead of deleting the row ═══
                  // Previously we deleted the SCB row when balance hit zero,
                  // which lost the creditLimit and broke re-adding the company
                  // later. Now we keep the row with balance = 0 so creditLimit
                  // and the shop-company association are preserved.
                  await client.query(
                    `UPDATE "ShopCompanyBalance" SET balance = 0, "updatedAt" = $1 WHERE id = $2`,
                    [new Date().toISOString(), oldScbRes.rows[0].id]
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

      // ═══ FIX H3: Recalc is now BLOCKING (see POST comment above) ═══
      const recalcResult = await recalcShopBalances(client, existingTxn.shopId);
      console.log(`[PUT /api/transactions] Recalculated shop ${existingTxn.shopId}: ${recalcResult.transactionsUpdated} txns, new balance Rs. ${recalcResult.newShopBalance}`);

      // ═══ FIX C6: Audit log INSIDE the transaction (before COMMIT) ═══
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
        if (oldCompanyId) {
          const oldCoRes = await client.query('SELECT name FROM "Company" WHERE id = $1', [oldCompanyId]);
          if (oldCoRes.rows.length > 0) oldCompanyName = oldCoRes.rows[0].name;
        }
        if (effectiveNewCompanyId) {
          const newCoRes = await client.query('SELECT name FROM "Company" WHERE id = $1', [effectiveNewCompanyId]);
          if (newCoRes.rows.length > 0) newCompanyName = newCoRes.rows[0].name;
        }
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
            ? `Company changed for ${oldType} Rs. ${oldAmount} at ${existingTxn.shop_name}: ${oldVal.companyName || 'None'} -> ${newVal.companyName || 'None'}`
            : `Transaction edited: ${oldType} Rs. ${oldAmount} -> Rs. ${finalAmount} at ${existingTxn.shop_name}`,
        ]
      );

      await client.query('COMMIT');

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
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error updating transaction:', error);
      return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
    } finally {
      client.release();
    }
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

    const client = await getClient();
    try {
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
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
      }

      const existingTxn = existingRes.rows[0];
      const shopBalance = Number(existingTxn.shop_balance);

      // Reverse the effect on shop balance
      // IMPORTANT: Pending recoveries never deducted balance, so don't add it back
      let newShopBalance: number;
      if (existingTxn.type === 'credit') {
        // Credits are always approved and added to balance — reverse it
        newShopBalance = shopBalance - Number(existingTxn.amount);
      } else {
        // Recovery: only reverse if it was approved (balance was actually deducted)
        if (existingTxn.status === 'approved') {
          newShopBalance = shopBalance + Number(existingTxn.amount);
        } else {
          // Pending recovery never changed the balance — don't reverse
          newShopBalance = shopBalance;
        }
      }

      newShopBalance = Math.round(newShopBalance * 100) / 100;

      // Delete transaction
      await client.query('DELETE FROM "Transaction" WHERE id = $1', [id]);

      // Update shop balance
      await client.query(
        `UPDATE "Shop" SET balance = $1 WHERE id = $2`,
        [newShopBalance, existingTxn.shopId]
      );

      // Update ShopCompanyBalance if applicable
      if (existingTxn.companyId && (existingTxn.type === 'credit' || existingTxn.status === 'approved')) {
        try {
          const scbRes = await client.query(
            `SELECT id, balance FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND "companyId" = $2`,
            [existingTxn.shopId, existingTxn.companyId]
          );
          if (scbRes.rows.length > 0) {
            let adjustedBalance: number;
            if (existingTxn.type === 'credit') {
              adjustedBalance = Number(scbRes.rows[0].balance) - Number(existingTxn.amount);
            } else {
              adjustedBalance = Number(scbRes.rows[0].balance) + Number(existingTxn.amount);
            }
            adjustedBalance = Math.round(adjustedBalance * 100) / 100;

            if (adjustedBalance <= 0) {
              // ═══ FIX H7: Set balance = 0 instead of deleting the row ═══
              await client.query(
                `UPDATE "ShopCompanyBalance" SET balance = 0, "updatedAt" = $1 WHERE id = $2`,
                [new Date().toISOString(), scbRes.rows[0].id]
              );
            } else {
              await client.query(
                `UPDATE "ShopCompanyBalance" SET balance = $1, "updatedAt" = $2 WHERE id = $3`,
                [adjustedBalance, new Date().toISOString(), scbRes.rows[0].id]
              );
            }
          }
        } catch (scbErr) {
          console.warn('ShopCompanyBalance adjustment on delete failed:', scbErr);
        }
      }

      // ═══ FIX H3: Recalc is now BLOCKING (see POST comment above) ═══
      const recalcResult = await recalcShopBalances(client, existingTxn.shopId);
      console.log(`[DELETE /api/transactions] Recalculated shop ${existingTxn.shopId}: ${recalcResult.transactionsUpdated} txns, new balance Rs. ${recalcResult.newShopBalance}`);

      // ═══ FIX C6: Audit log INSIDE the transaction (before COMMIT) ═══
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

      await client.query('COMMIT');

      return NextResponse.json({ success: true, deletedId: id, newShopBalance });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error deleting transaction:', error);
      return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }
}
