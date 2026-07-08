import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';
import crypto from 'crypto';

// SECURITY: Get authenticated user ID from proxy header (set by JWT verification)
function getAuthenticatedUser(request: NextRequest): { userId: string; role: string } | null {
  const userId = request.headers.get('x-auth-userid');
  const role = request.headers.get('x-auth-role');
  if (!userId) return null;
  return { userId, role: role || 'orderbooker' };
}

// GET /api/mobile/sync?userId=xxx
// Returns all data for a specific orderbooker (shops + recent transactions)
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Verify authenticated user
    const auth = getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');

    if (!requestedUserId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // SECURITY: Orderbookers can only sync their OWN data; admins can sync any user
    if (auth.role !== 'admin' && auth.userId !== requestedUserId) {
      return NextResponse.json({ error: 'You can only sync your own data' }, { status: 403 });
    }

    const userId = requestedUserId;

    const pool = getPool();

    // 1. Get ACTIVE shops assigned to this orderbooker (PRIMARY + JUNCTION)
    // Primary: shops where orderbookerId = userId
    // Junction: shops where userId is in ShopOrderbooker table
    const shopRes = await pool.query(
      `SELECT DISTINCT s.*, u.name AS "ob_name"
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       WHERE s.status = 'active'
         AND (
           s."orderbookerId" = $1
           OR EXISTS (
             SELECT 1 FROM "ShopOrderbooker" so
             WHERE so."shopId" = s.id AND so."orderbookerId" = $1
           )
         )
       ORDER BY s.name ASC`,
      [userId]
    );

    const shops = shopRes.rows.map((s: any) => ({
      id: s.id,
      name: s.name,
      ownerName: s.ownerName,
      area: s.area,
      address: s.address,
      phone: s.phone,
      routeDays: s.routeDays || [],
      orderbookerId: s.orderbookerId,
      balance: Number(s.balance),
      creditLimit: Number(s.creditLimit),
      status: s.status,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
      orderbookerName: s.ob_name,
    }));

    // 1b. Get company balances for all synced shops
    try {
      const shopIds = shops.map((s: any) => s.id);
      if (shopIds.length > 0) {
        const scbRes = await pool.query(
          `SELECT scb."shopId", scb."companyId", scb.balance, scb."creditLimit", co.name AS "companyName"
           FROM "ShopCompanyBalance" scb
           LEFT JOIN "Company" co ON scb."companyId" = co.id
           WHERE scb."shopId" = ANY($1)`,
          [shopIds]
        );
        const companyBalancesMap: Record<string, any[]> = {};
        for (const row of scbRes.rows) {
          if (!companyBalancesMap[row.shopId]) companyBalancesMap[row.shopId] = [];
          companyBalancesMap[row.shopId].push({
            companyId: row.companyId,
            companyName: row.companyName,
            balance: Number(row.balance),
            creditLimit: Number(row.creditLimit),
          });
        }
        for (const shop of shops) {
          (shop as any).companyBalances = companyBalancesMap[shop.id] || [];
        }
      }
    } catch {
      // ShopCompanyBalance table might not exist yet - just skip
    }

    // 1c. Get route day overrides from ShopOrderbooker for this user
    try {
      const junctionRes = await pool.query(
        `SELECT so."shopId", so."routeDays", so."companyId"
         FROM "ShopOrderbooker" so
         WHERE so."orderbookerId" = $1`,
        [userId]
      );
      // Create a map for quick lookup
      const junctionMap: Record<string, { routeDays: string[]; companyId: string }> = {};
      for (const row of junctionRes.rows) {
        junctionMap[row.shopId] = {
          routeDays: row.routeDays || [],
          companyId: row.companyId,
        };
      }
      // Override routeDays for junction shops with assignment-specific days
      for (const shop of shops) {
        if (junctionMap[shop.id]) {
          // This is a secondary assignment — use junction-specific routeDays
          (shop as any).routeDays = junctionMap[shop.id].routeDays; // Already parsed array
        }
      }
    } catch {
      // ShopOrderbooker table might not exist yet - just skip
    }

    // 2. Get recent transactions for this orderbooker's shops (last 200) - exclude rejected
    // Include transactions created BY this orderbooker AND transactions on their shops by other users (e.g., admin recoveries)
    const shopIds = shops.map((s: any) => s.id);
    let txRes;
    if (shopIds.length > 0) {
      txRes = await pool.query(
        `SELECT t.*, s.name AS "shopName", u.name AS "createdByName"
         FROM "Transaction" t
         LEFT JOIN "Shop" s ON t."shopId" = s.id
         LEFT JOIN "User" u ON t."createdBy" = u.id
         WHERE t.status != 'rejected'
           AND (t."createdBy" = $1 OR t."shopId" = ANY($2))
         ORDER BY t."createdAt" DESC
         LIMIT 200`,
        [userId, shopIds]
      );
    } else {
      txRes = await pool.query(
        `SELECT t.*, s.name AS "shopName", u.name AS "createdByName"
         FROM "Transaction" t
         LEFT JOIN "Shop" s ON t."shopId" = s.id
         LEFT JOIN "User" u ON t."createdBy" = u.id
         WHERE t."createdBy" = $1
           AND t.status != 'rejected'
         ORDER BY t."createdAt" DESC
         LIMIT 200`,
        [userId]
      );
    }

    const transactions = txRes.rows.map((t: any) => ({
      id: t.id,
      shopId: t.shopId,
      shopName: t.shopName,
      type: t.type,
      amount: Number(t.amount),
      previousBalance: t.previousBalance ? Number(t.previousBalance) : null,
      newBalance: t.newBalance ? Number(t.newBalance) : null,
      balanceAfter: t.balanceAfter ? Number(t.balanceAfter) : null,
      description: t.description,
      note: t.note,
      status: t.status,
      createdBy: t.createdBy,
      createdByName: t.createdByName,
      approvedBy: t.approvedBy,
      companyId: t.companyId || null,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
      updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
    }));

    // 3. Get user info (including companyId and companyName)
    const userRes = await pool.query(
      'SELECT u.id, u.username, u.name, u.role, u.phone, u.status, u."allRoutesEnabled", u."companyId", c.name AS "companyName" FROM "User" u LEFT JOIN "Company" c ON u."companyId" = c.id WHERE u.id = $1',
      [userId]
    );
    const user = userRes.rows[0];

    // 3b. Get user's companies from UserCompany junction table
    let userCompanies: { companyId: string; companyName: string; isPrimary: boolean }[] = [];
    try {
      const ucRes = await pool.query(
        `SELECT uc."companyId", uc."isPrimary", c.name AS "companyName"
         FROM "UserCompany" uc
         JOIN "Company" c ON uc."companyId" = c.id
         WHERE uc."userId" = $1 AND c.status = 'active'
         ORDER BY uc."isPrimary" DESC, c.name ASC`,
        [userId]
      );
      userCompanies = ucRes.rows.map((row: any) => ({
        companyId: row.companyId,
        companyName: row.companyName,
        isPrimary: row.isPrimary,
      }));
    } catch {
      // UserCompany table might not exist yet - fallback
    }

    // Fallback: if no UserCompany records, derive from User.companyId
    if (userCompanies.length === 0 && user?.companyId) {
      const primaryComp = await pool.query(
        'SELECT id, name FROM "Company" WHERE id = $1 AND status = \'active\'',
        [user.companyId]
      );
      if (primaryComp.rows.length > 0) {
        userCompanies.push({
          companyId: primaryComp.rows[0].id,
          companyName: primaryComp.rows[0].name,
          isPrimary: true,
        });
      }
    }

    // 4. Get shop notes for this orderbooker's shops
    let shopNotes: any[] = [];
    try {
      const notesRes = await pool.query(
        `SELECT n.id, n."shopId", n.note, n."createdBy", n."createdAt", n."updatedAt"
         FROM "ShopNote" n
         INNER JOIN "Shop" s ON n."shopId" = s.id
         WHERE s."orderbookerId" = $1
            OR EXISTS (
              SELECT 1 FROM "ShopOrderbooker" so
              WHERE so."shopId" = s.id AND so."orderbookerId" = $1
            )
         ORDER BY n."updatedAt" DESC`,
        [userId]
      );
      shopNotes = notesRes.rows.map((n: any) => ({
        id: n.id,
        shopId: n.shopId,
        note: n.note,
        createdBy: n.createdBy,
        createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
        updatedAt: n.updatedAt instanceof Date ? n.updatedAt.toISOString() : n.updatedAt,
      }));
    } catch { /* ShopNote/ShopOrderbooker table may not exist yet */ }

    // 5. Get daily target for current month
    let dailyTarget: any = null;
    try {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const targetRes = await pool.query(
        'SELECT * FROM "DailyTarget" WHERE "orderbookerId" = $1 AND month = $2',
        [userId, currentMonth]
      );
      if (targetRes.rows.length > 0) {
        dailyTarget = {
          id: targetRes.rows[0].id,
          orderbookerId: targetRes.rows[0].orderbookerId,
          target: Number(targetRes.rows[0].target),
          month: targetRes.rows[0].month,
        };
      }
    } catch { /* DailyTarget table may not exist yet */ }

    // 6. Get user preferences
    let userPreferences: any = null;
    try {
      const prefRes = await pool.query(
        'SELECT * FROM "UserPreference" WHERE "userId" = $1',
        [userId]
      );
      if (prefRes.rows.length > 0) {
        userPreferences = {
          tourCompleted: prefRes.rows[0].tourCompleted,
          preferences: prefRes.rows[0].preferences ? JSON.parse(prefRes.rows[0].preferences) : null,
        };
      }
    } catch { /* UserPreference table may not exist yet */ }

    return NextResponse.json({
      shops,
      transactions,
      user: user ? {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        phone: user.phone,
        status: user.status,
        allRoutesEnabled: user.allRoutesEnabled ?? false,
        companyId: user.companyId || null,
        companyName: user.companyName || null,
        companies: userCompanies,
      } : null,
      shopNotes,
      dailyTarget,
      userPreferences,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in mobile sync GET:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

// POST /api/mobile/sync
// Accepts pending transactions from mobile to sync to server
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Verify authenticated user
    const auth = getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { transactions } = body;

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json({ error: 'transactions array is required' }, { status: 400 });
    }

    // SECURITY: Limit batch size to prevent abuse
    if (transactions.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 transactions per sync batch' }, { status: 400 });
    }

    const client = await getClient();
    try {
      const results = [];
      const errors = [];

      for (const tx of transactions) {
        try {
          // SECURITY: Validate amount is positive
          if (!tx.amount || Number(tx.amount) <= 0) {
            errors.push({ localId: tx.localId, error: 'Amount must be greater than 0' });
            continue;
          }

          // SECURITY: Override createdBy with authenticated user ID
          // Prevents impersonation — user can only create transactions as themselves
          const createdBy = auth.role === 'admin' ? (tx.createdBy || auth.userId) : auth.userId;

          await client.query('BEGIN');

          const txType = tx.type || 'recovery';
          const txId = `tx_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
          const now = new Date().toISOString();

          // Idempotency check: if idempotencyKey is provided, skip if already exists
          if (tx.idempotencyKey) {
            const existingRes = await client.query(
              'SELECT id FROM "Transaction" WHERE "idempotencyKey" = $1',
              [tx.idempotencyKey]
            );
            if (existingRes.rows.length > 0) {
              await client.query('ROLLBACK');
              results.push({
                localId: tx.localId,
                serverId: existingRes.rows[0].id,
                status: 'duplicate_skipped',
                success: true,
              });
              continue;
            }
          }

          // Business rule: credits are auto-approved, recoveries need admin approval
          const txnStatus = txType === 'credit' ? 'approved' : 'pending';

          // Fetch shop for balance calculation
          const shopRes = await client.query('SELECT balance, status, "orderbookerId" FROM "Shop" WHERE id = $1', [tx.shopId]);
          if (shopRes.rows.length === 0) {
            await client.query('ROLLBACK');
            errors.push({ localId: tx.localId, error: 'Shop not found' });
            continue;
          }
          const shopBalance = Number(shopRes.rows[0].balance);

          // Infer companyId if not provided by mobile client
          // Step 1: Prefer the company with the HIGHEST balance in ShopCompanyBalance
          // Step 2: Fallback to orderbooker's primary company
          let effectiveCompanyId = tx.companyId || null;
          if (!effectiveCompanyId) {
            try {
              const scbRes = await client.query(
                'SELECT "companyId" FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND balance > 0 ORDER BY balance DESC LIMIT 1',
                [tx.shopId]
              );
              if (scbRes.rows.length > 0) {
                effectiveCompanyId = scbRes.rows[0].companyId;
              }
            } catch { /* ShopCompanyBalance table may not exist */ }

            if (!effectiveCompanyId && shopRes.rows[0].orderbookerId) {
              try {
                const obRes = await client.query('SELECT "companyId" FROM "User" WHERE id = $1', [shopRes.rows[0].orderbookerId]);
                if (obRes.rows.length > 0 && obRes.rows[0].companyId) {
                  effectiveCompanyId = obRes.rows[0].companyId;
                }
              } catch { /* non-blocking */ }
            }
          }

          let previousBalance = shopBalance;
          let newBalance = shopBalance;

          if (txType === 'credit') {
            // Credit: add to balance immediately
            newBalance = Math.round((shopBalance + Number(tx.amount)) * 100) / 100;
            await client.query(
              'UPDATE "Shop" SET balance = $1 WHERE id = $2',
              [newBalance, tx.shopId]
            );

            // Update ShopCompanyBalance for credit if companyId is available
            if (effectiveCompanyId) {
              try {
                const scbRes = await client.query(
                  `SELECT id, balance FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND "companyId" = $2`,
                  [tx.shopId, effectiveCompanyId]
                );
                if (scbRes.rows.length > 0) {
                  const newCompanyBalance = Math.round((Number(scbRes.rows[0].balance) + Number(tx.amount)) * 100) / 100;
                  await client.query(
                    `UPDATE "ShopCompanyBalance" SET balance = $1, "updatedAt" = $2 WHERE id = $3`,
                    [newCompanyBalance, now, scbRes.rows[0].id]
                  );
                } else {
                  // Create new ShopCompanyBalance entry for this company
                  const scbId = `scb_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
                  await client.query(
                    `INSERT INTO "ShopCompanyBalance" (id, "shopId", "companyId", balance, "creditLimit", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [scbId, tx.shopId, effectiveCompanyId, Math.round(Number(tx.amount) * 100) / 100, 0, now, now]
                  );
                }
              } catch (scbErr) {
                console.warn('ShopCompanyBalance update failed in mobile sync:', scbErr);
              }
            }
          }
          // Recovery: don't change balance yet (pending approval)

          const txRes = await client.query(
            `INSERT INTO "Transaction" (id, "shopId", type, status, amount, "previousBalance", "newBalance", description, "createdBy", "companyId", "idempotencyKey", "gpsLat", "gpsLng", "gpsAddress", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING *`,
            [
              txId,
              tx.shopId,
              txType,
              txnStatus,
              tx.amount,
              previousBalance,
              newBalance,
              tx.description || (txType === 'credit' ? 'Mobile sync credit' : 'Mobile sync recovery'),
              createdBy, // SECURITY: Uses authenticated user ID, not client-supplied value
              effectiveCompanyId || null,
              tx.idempotencyKey || null,
              tx.gpsLat ?? null,
              tx.gpsLng ?? null,
              tx.gpsAddress ?? null,
              now,
              now,
            ]
          );

          await client.query('COMMIT');

          results.push({
            localId: tx.localId,
            serverId: txRes.rows[0].id,
            status: txnStatus,
            success: true,
          });
        } catch (err: any) {
          try { await client.query('ROLLBACK'); } catch {}
          errors.push({
            localId: tx.localId,
            error: err.message,
          });
        }
      }

      return NextResponse.json({
        synced: results.length,
        failed: errors.length,
        results,
        errors,
      });
    } catch (error) {
      console.error('Error in mobile sync POST:', error);
      return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in mobile sync POST:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
