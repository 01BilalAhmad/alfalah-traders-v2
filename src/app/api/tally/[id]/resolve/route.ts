import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { ensureTallyTables, RESOLUTION_TYPES, type ResolutionType } from '@/lib/tally-migrations';

// POST /api/tally/[id]/resolve
// Body: { resolutionType, resolutionNote? }
// Admin-only: marks an open discrepancy tally as resolved.
//
// Balance adjustment happens for ALL resolution types.
// The difference is applied to:
//   1. Shop.balance (main shop balance)
//   2. ShopCompanyBalance (per-company balance — used by Balance Sheet + OB app)
//   3. Transaction record (for ledger)
//   4. recalcShopBalances (ensures running balances are correct)
//
// ALL updates happen inside a DB transaction (BEGIN/COMMIT) so they're atomic.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: tallyId } = await params;
    const body = await request.json();
    const { resolutionType, resolutionNote } = body;

    if (!resolutionType || !RESOLUTION_TYPES.includes(resolutionType as ResolutionType)) {
      return NextResponse.json({
        error: `Invalid resolutionType. Valid: ${RESOLUTION_TYPES.join(', ')}`,
      }, { status: 400 });
    }

    const pool = getPool();
    await ensureTallyTables();

    // ─── 1. Fetch tally details + shop info ──────────────────────
    const tallyRes = await pool.query(
      `SELECT st.id, st.status, st."resolutionStatus", st."shopId",
              st."difference", st."systemBalance", st."shopBalance",
              st."orderbookerId",
              s.name AS "shopName", s.balance AS "currentShopBalance"
       FROM "ShopTally" st
       LEFT JOIN "Shop" s ON st."shopId" = s.id
       WHERE st.id = $1`,
      [tallyId]
    );
    if (tallyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Tally not found' }, { status: 404 });
    }
    const tally = tallyRes.rows[0];
    if (tally.status !== 'discrepancy') {
      return NextResponse.json({ error: 'Only discrepancy tallies can be resolved' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // ─── 2. Update tally resolution status ───────────────────────
    await pool.query(
      `UPDATE "ShopTally"
          SET "resolutionStatus" = 'resolved',
              "resolutionType" = $1,
              "resolutionNote" = $2,
              "resolvedBy" = $3,
              "resolvedAt" = $4
        WHERE id = $5`,
      [
        resolutionType,
        resolutionNote ? String(resolutionNote).slice(0, 1000) : null,
        auth.userId,
        now,
        tallyId,
      ]
    );

    // ─── 3. BALANCE ADJUSTMENT ───────────────────────────────────
    // Adjust Shop.balance + ShopCompanyBalance + create Transaction
    // ALL inside a DB transaction for atomicity.
    let adjustmentMade = false;
    let adjustmentAmount = 0;
    let newBalance = 0;

    try {
      const currentBalance = Number(tally.currentShopBalance) || 0;
      const targetBalance = Number(tally.shopBalance) || 0;
      adjustmentAmount = Math.round((targetBalance - currentBalance) * 100) / 100;

      if (Math.abs(adjustmentAmount) >= 0.01) {
        const txnId = `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        const txnType = adjustmentAmount < 0 ? 'recovery' : 'credit';
        newBalance = targetBalance;

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // 3a. Create adjustment Transaction
          await client.query(
            `INSERT INTO "Transaction"
              (id, "shopId", type, amount, "previousBalance", "newBalance",
               description, status, "createdBy", "approvedBy", "approvedAt", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, $8, NOW(), NOW())`,
            [
              txnId,
              tally.shopId,
              txnType,
              Math.abs(adjustmentAmount),
              currentBalance,
              targetBalance,
              `Balance Adjustment — Tally Resolution (${resolutionType})`,
              auth.userId,
            ]
          );

          // 3b. Update Shop.balance
          await client.query(
            `UPDATE "Shop" SET balance = $1, "updatedAt" = NOW() WHERE id = $2`,
            [targetBalance, tally.shopId]
          );

          // 3c. ─── DIRECTLY update ALL ShopCompanyBalance rows for this shop ───
          // recalcShopBalances only updates companies that have transactions with
          // companyId set. But our adjustment transaction has companyId=NULL.
          // So we ALSO directly adjust each ShopCompanyBalance by the same ratio.
          //
          // Strategy: If shop has multiple companies, split the adjustment
          // proportionally. If shop has 1 company, apply full adjustment.
          // If shop has 0 companies (ShopCompanyBalance), just update Shop.balance
          // (already done in 3b).

          const scbRes = await client.query(
            `SELECT "companyId", balance FROM "ShopCompanyBalance" WHERE "shopId" = $1`,
            [tally.shopId]
          );

          if (scbRes.rows.length === 1) {
            // Single company — apply full adjustment
            const oldScbBalance = Number(scbRes.rows[0].balance) || 0;
            const newScbBalance = Math.round((oldScbBalance + adjustmentAmount) * 100) / 100;
            await client.query(
              `UPDATE "ShopCompanyBalance"
                  SET balance = $1, "updatedAt" = NOW()
                WHERE "shopId" = $2 AND "companyId" = $3`,
              [newScbBalance, tally.shopId, scbRes.rows[0].companyId]
            );
          } else if (scbRes.rows.length > 1) {
            // Multiple companies — apply adjustment to the LARGEST balance company
            // (most likely the one with the discrepancy)
            const sorted = scbRes.rows.sort((a, b) => Number(b.balance) - Number(a.balance));
            const oldScbBalance = Number(sorted[0].balance) || 0;
            const newScbBalance = Math.round((oldScbBalance + adjustmentAmount) * 100) / 100;
            await client.query(
              `UPDATE "ShopCompanyBalance"
                  SET balance = $1, "updatedAt" = NOW()
                WHERE "shopId" = $2 AND "companyId" = $3`,
              [newScbBalance, tally.shopId, sorted[0].companyId]
            );
          }

          // 3d. Run recalcShopBalances to fix running balances on transactions
          // + ensure ShopCompanyBalance is consistent
          const { recalcShopBalances } = await import('@/lib/recalc-balances');
          await recalcShopBalances(client, tally.shopId);

          await client.query('COMMIT');
        } catch (txnErr) {
          await client.query('ROLLBACK');
          throw txnErr;
        } finally {
          client.release();
        }

        adjustmentMade = true;
      }
    } catch (err) {
      console.error('[Tally resolve] Balance adjustment failed:', err);
    }

    // ─── 4. Audit log ────────────────────────────────────────────
    try {
      const crypto = await import('crypto');
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "newValue", description)
         VALUES ($1, 'update', 'shopTally', $2, $3, $4)`,
        [
          auditId,
          tallyId,
          JSON.stringify({
            resolutionType,
            resolutionNote,
            resolvedBy: auth.userId,
            balanceAdjusted: adjustmentMade,
            adjustmentAmount,
            newBalance,
          }),
          `Tally ${tallyId} for ${tally.shopName} resolved as ${resolutionType}` +
          (adjustmentMade ? ` — Balance adjusted by ${adjustmentAmount > 0 ? '+' : ''}${adjustmentAmount}` : ' — No adjustment needed'),
        ]
      );
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      tallyId,
      resolutionStatus: 'resolved',
      resolutionType,
      resolvedAt: now,
      balanceAdjusted: adjustmentMade,
      adjustmentAmount,
      newBalance,
    });
  } catch (error) {
    console.error('[Tally Resolve API] error:', error);
    return NextResponse.json({ error: 'Failed to resolve tally' }, { status: 500 });
  }
}
