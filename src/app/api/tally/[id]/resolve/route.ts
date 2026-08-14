import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { ensureTallyTables, RESOLUTION_TYPES, type ResolutionType } from '@/lib/tally-migrations';

// POST /api/tally/[id]/resolve
// Body: { resolutionType, resolutionNote? }
// Admin-only: marks an open discrepancy tally as resolved.
//
// IMPORTANT: Balance adjustment happens for ALL resolution types.
// The difference amount is automatically subtracted/added to the shop's
// balance, and a "Balance Adjustment" transaction is created in the ledger.
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

    // ─── 1. Fetch tally details ──────────────────────────────────
    const tallyRes = await pool.query(
      `SELECT st.id, st.status, st."resolutionStatus", st."shopId",
              st."difference", st."systemBalance", st."shopBalance",
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

    // ─── 3. BALANCE ADJUSTMENT (for ALL resolution types) ────────
    // The difference = systemBalance - shopBalance
    // If difference > 0: system shows MORE → subtract difference (recovery)
    // If difference < 0: system shows LESS → add |difference| (credit)
    // Target: shop's balance should match what shopkeeper claimed (shopBalance)
    let adjustmentMade = false;
    let adjustmentAmount = 0;
    let newBalance = 0;

    try {
      // Get the CURRENT shop balance (fresh from DB, not the stale tally value)
      const shopFresh = await pool.query(
        `SELECT id, balance FROM "Shop" WHERE id = $1`,
        [tally.shopId]
      );
      if (shopFresh.rows.length > 0) {
        const currentBalance = Number(shopFresh.rows[0].balance) || 0;
        const targetBalance = Number(tally.shopBalance) || 0;
        adjustmentAmount = Math.round((targetBalance - currentBalance) * 100) / 100;

        if (Math.abs(adjustmentAmount) >= 0.01) {
          // Create adjustment transaction
          const txnId = `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
          // If adjustmentAmount < 0 → system balance needs to DECREASE → type = 'recovery'
          // If adjustmentAmount > 0 → system balance needs to INCREASE → type = 'credit'
          const txnType = adjustmentAmount < 0 ? 'recovery' : 'credit';
          newBalance = targetBalance;

          // Use a transaction so Shop + ShopCompanyBalance + Transaction
          // all update atomically (no partial updates)
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

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

            // Update Shop.balance
            await client.query(
              `UPDATE "Shop" SET balance = $1, "updatedAt" = NOW() WHERE id = $2`,
              [targetBalance, tally.shopId]
            );

            // ─── CRITICAL: Recalculate ShopCompanyBalance ───────────
            // This is what Balance Sheet and OB app use to show balances.
            // Without this, Balance Sheet shows OLD balance even after resolve.
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
      }
    } catch (err) {
      console.error('[Tally resolve] Balance adjustment failed:', err);
      // Don't block — resolution itself still succeeded, but log the error
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
