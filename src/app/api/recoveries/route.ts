import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';
import crypto from 'crypto';
import { recalcShopBalances } from '@/lib/recalc-balances';

// GET /api/recoveries?status=pending&orderbookerId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const orderbookerId = searchParams.get('orderbookerId');

    const pool = getPool();

    // Support filtering by type: 'recovery' (default), 'credit', or 'all'
    const typeFilter = searchParams.get('type') || 'recovery';
    const conditions: string[] = [];
    const params: any[] = [status];
    conditions.push(`t.status = $1`);
    if (typeFilter !== 'all') {
      conditions.push(`t.type = $${params.length + 1}`);
      params.push(typeFilter);
    }
    let paramIndex = 2;

    if (orderbookerId) {
      conditions.push(`t."createdBy" = $${paramIndex++}`);
      params.push(orderbookerId);
    }

    const whereClause = conditions.join(' AND ');

    const txnRes = await pool.query(
      `SELECT t.*, s.id AS "shop_id", s.name AS "shop_name", s.area AS "shop_area", s.balance AS "shop_balance",
              c.id AS "creator_id", c.name AS "creator_name", c.phone AS "creator_phone"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       LEFT JOIN "User" c ON t."createdBy" = c.id
       WHERE ${whereClause}
       ORDER BY t."createdAt" DESC`,
      params
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
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
      shop: {
        id: t.shop_id,
        name: t.shop_name,
        area: t.shop_area,
        balance: Number(t.shop_balance),
      },
      creator: {
        id: t.creator_id,
        name: t.creator_name,
        phone: t.creator_phone,
      },
    }));

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

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Fetch all pending transactions with shop info
      const placeholders = transactionIds.map((_: unknown, idx: number) => `$${idx + 1}`).join(', ');
      const pendingRes = await client.query(
        `SELECT t.*, s.id AS "shop_db_id", s.name AS "shop_name", s.balance AS "shop_balance"
         FROM "Transaction" t
         LEFT JOIN "Shop" s ON t."shopId" = s.id
         WHERE t.id IN (${placeholders}) AND t.status = 'pending'`,
        transactionIds
      );

      if (pendingRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'No pending transactions found' }, { status: 404 });
      }

      if (pendingRes.rows.length !== transactionIds.length) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          error: `${transactionIds.length - pendingRes.rows.length} transaction(s) not found or not pending`,
          processed: pendingRes.rows.length,
          skipped: transactionIds.length - pendingRes.rows.length,
        }, { status: 400 });
      }

      const now = new Date().toISOString();
      const results: any[] = [];

      for (const txn of pendingRes.rows) {
        if (action === 'approve') {
          // ── FIX C2: Re-fetch fresh shop balance inside the loop ──
          // Previously we used the stale `txn.shop_balance` fetched once before
          // the loop, which caused bulk-approve of multiple recoveries to use
          // the same starting balance for each (lost-update).
          // Now we read the CURRENT balance inside the loop with FOR UPDATE so
          // each iteration sees the effect of the previous one.
          const freshShopRes = await client.query(
            `SELECT balance FROM "Shop" WHERE id = $1 FOR UPDATE`,
            [txn.shopId]
          );
          const freshShopBalance = Number(freshShopRes.rows[0]?.balance ?? 0);

          // For recovery: deduct from shop balance. For credit: add to shop balance.
          let newBalance: number;
          if (txn.type === 'recovery') {
            newBalance = Math.round((freshShopBalance - Number(txn.amount)) * 100) / 100;
          } else {
            // Credit approval (legacy pending credits)
            newBalance = Math.round((freshShopBalance + Number(txn.amount)) * 100) / 100;
          }

          await client.query(
            `UPDATE "Transaction" SET status = 'approved', "approvedBy" = $1, "approvedAt" = $2, "newBalance" = $3 WHERE id = $4`,
            [approvedBy, now, newBalance, txn.id]
          );

          await client.query(
            `UPDATE "Shop" SET balance = $1 WHERE id = $2`,
            [newBalance, txn.shopId]
          );

          // Update ShopCompanyBalance if transaction has companyId
          // If no companyId, try to infer from ShopCompanyBalance (highest balance first) or shop's orderbooker
          let effectiveCompanyId = txn.companyId || null;
          if (!effectiveCompanyId) {
            // Step 1: Prefer the company with the HIGHEST balance in ShopCompanyBalance
            // This is more reliable than the orderbooker's primary company because
            // a recovery should reduce the balance of the company that has outstanding credit
            try {
              const scbFallbackRes = await client.query(
                'SELECT "companyId" FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND balance > 0 ORDER BY balance DESC LIMIT 1',
                [txn.shopId]
              );
              if (scbFallbackRes.rows.length > 0) {
                effectiveCompanyId = scbFallbackRes.rows[0].companyId;
              }
            } catch { /* ShopCompanyBalance table may not exist */ }

            // Step 2: Fallback to shop's orderbooker primary company only if no SCB entry
            if (!effectiveCompanyId) {
              try {
                const shopRes = await client.query(
                  `SELECT s."orderbookerId", u."companyId" AS "ob_companyId"
                   FROM "Shop" s
                   LEFT JOIN "User" u ON s."orderbookerId" = u.id
                   WHERE s.id = $1`,
                  [txn.shopId]
                );
                if (shopRes.rows.length > 0 && shopRes.rows[0].ob_companyId) {
                  effectiveCompanyId = shopRes.rows[0].ob_companyId;
                }
              } catch { /* non-blocking */ }
            }

            // If we inferred a companyId, update the transaction record too
            if (effectiveCompanyId) {
              await client.query(
                `UPDATE "Transaction" SET "companyId" = $1 WHERE id = $2`,
                [effectiveCompanyId, txn.id]
              );
            }
          }

          if (effectiveCompanyId) {
            try {
              const scbRes = await client.query(
                `SELECT id, balance FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND "companyId" = $2`,
                [txn.shopId, effectiveCompanyId]
              );
              if (scbRes.rows.length > 0) {
                let newCompanyBalance: number;
                if (txn.type === 'recovery') {
                  newCompanyBalance = Math.round((Number(scbRes.rows[0].balance) - Number(txn.amount)) * 100) / 100;
                } else {
                  newCompanyBalance = Math.round((Number(scbRes.rows[0].balance) + Number(txn.amount)) * 100) / 100;
                }
                await client.query(
                  `UPDATE "ShopCompanyBalance" SET balance = $1, "updatedAt" = $2 WHERE id = $3`,
                  [newCompanyBalance, now, scbRes.rows[0].id]
                );
              }
            } catch (scbErr) {
              // ShopCompanyBalance table might not exist yet - non-blocking
              console.warn('ShopCompanyBalance update on approval failed:', scbErr);
            }
          }

          results.push({
            id: txn.id,
            shopName: txn.shop_name,
            amount: Number(txn.amount),
            newBalance,
            action: 'approved',
          });
        } else {
          await client.query(
            `UPDATE "Transaction" SET status = 'rejected', "approvedBy" = $1, "approvedAt" = $2, "rejectReason" = $3 WHERE id = $4`,
            [approvedBy, now, rejectReason || null, txn.id]
          );

          results.push({
            id: txn.id,
            shopName: txn.shop_name,
            amount: Number(txn.amount),
            action: 'rejected',
          });
        }
      }

      // ═══ FIX H3: Recalc is now BLOCKING for each affected shop ════════
      // Approving/rejecting changes which transactions count toward the
      // running balance, so later transactions' prev/new may shift.
      // If recalc fails for ANY shop, the whole operation rolls back.
      const affectedShopIds = Array.from(new Set(pendingRes.rows.map((r: any) => r.shopId)));
      for (const sid of affectedShopIds) {
        const recalcResult = await recalcShopBalances(client, sid);
        console.log(`[POST /api/recoveries] Recalculated shop ${sid}: ${recalcResult.transactionsUpdated} txns, new balance Rs. ${recalcResult.newShopBalance}`);
      }

      // ═══ FIX C6: Audit log INSIDE the transaction (before COMMIT) ═══
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      const totalAmount = pendingRes.rows.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      await client.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "performedBy", "newValue", description)
         VALUES ($1, $2, 'transaction', $3, $4, $5, $6)`,
        [
          auditId,
          action === 'approve' ? 'recovery_approved' : 'recovery_rejected',
          transactionIds[0],
          approvedBy,
          JSON.stringify({
            action,
            transactionIds,
            count: pendingRes.rows.length,
            totalAmount,
            rejectReason: rejectReason || null,
          }),
          `${action === 'approve' ? 'Approved' : 'Rejected'} ${pendingRes.rows.length} transaction(s) totaling Rs. ${Math.round(totalAmount)}`,
        ]
      );

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        processed: results.length,
        action,
        results,
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error processing recovery action:', error);
      return NextResponse.json({ error: 'Failed to process recovery action' }, { status: 500 });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error processing recovery action:', error);
    return NextResponse.json({ error: 'Failed to process recovery action' }, { status: 500 });
  }
}
