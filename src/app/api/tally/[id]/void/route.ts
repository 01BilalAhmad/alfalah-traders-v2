import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { ensureTallyTables } from '@/lib/tally-migrations';

// POST /api/tally/[id]/void
// Body: { voidReason }
// Admin-only: marks a tally as voided.
//
// BUG FIX (previously): the old code only set voided=true on ShopTally.
// If the tally had been RESOLVED earlier (which created an adjustment
// Transaction that updated Shop.balance + ShopCompanyBalance), that
// adjustment remained in effect forever — even after the tally was
// voided. Admin's "void" was therefore a soft-delete on metadata only,
// leaving the ledger and shop balances permanently wrong.
//
// Fix: if the tally was previously resolved, ALSO create a reverse
// Transaction (type 'balance_adjustment', SIGNED amount that negates
// the original adjustment) + run recalcShopBalances so the shop's
// running balance is corrected. The reversal does NOT count as credit
// or recovery in dashboard KPIs.
//
// ATOMICITY FIX: marking the tally voided and the reversal now happen
// inside ONE DB transaction. Previously the void succeeded even if the
// reversal failed, leaving the ledger wrong while the tally said
// "voided" (no retry possible). Now either both succeed or both roll
// back.
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
    const { voidReason } = body;

    if (!voidReason || !String(voidReason).trim()) {
      return NextResponse.json({ error: 'voidReason is required' }, { status: 400 });
    }

    const pool = getPool();
    await ensureTallyTables();

    // ─── 1. Fetch tally + shop info ──────────────────────
    //    Need resolutionStatus + resolvedAt to know whether to reverse
    //    an adjustment. Also fetch shopId + shopName for the audit log.
    const tallyRes = await pool.query(
      `SELECT st.id, st.voided, st."resolutionStatus", st."resolvedAt",
              st."shopId", st."difference", s.name AS "shopName",
              s.balance AS "currentShopBalance"
       FROM "ShopTally" st
       LEFT JOIN "Shop" s ON st."shopId" = s.id
       WHERE st.id = $1`,
      [tallyId]
    );
    if (tallyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Tally not found' }, { status: 404 });
    }
    const tally = tallyRes.rows[0];
    if (tally.voided) {
      return NextResponse.json({ error: 'Tally is already voided' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const trimmedReason = String(voidReason).trim().slice(0, 500);

    // ─── 2. Locate the original adjustment Transaction (if resolved) ──
    //    The resolve route's description starts with:
    //      "Balance Adjustment — Tally Resolution ("
    //    Time window of ±5 minutes around resolvedAt to be safe against
    //    clock skew (resolve step does everything in one DB txn, so the
    //    Transaction.createdAt is within milliseconds of resolvedAt).
    //    NOTE: the reverse txns created by THIS route start with
    //    "Reverse Balance Adjustment — Tally Void", so the LIKE pattern
    //    never matches them (no double-reversal).
    let origTxn: { id: string; type: string; amount: string; companyId: string | null } | null = null;
    if (tally.resolutionStatus === 'resolved' && tally.resolvedAt) {
      const adjTxnRes = await pool.query(
        `SELECT id, type, amount, "companyId"
           FROM "Transaction"
          WHERE "shopId" = $1
            AND description LIKE 'Balance Adjustment — Tally Resolution %'
            AND "createdAt" >= $2::timestamptz - INTERVAL '5 minutes'
            AND "createdAt" <= $2::timestamptz + INTERVAL '5 minutes'
          ORDER BY "createdAt" DESC
          LIMIT 1`,
        [tally.shopId, tally.resolvedAt]
      );
      if (adjTxnRes.rows.length > 0) {
        origTxn = adjTxnRes.rows[0];
      }
    }

    let reversalMade = false;
    let reversalTxnId: string | null = null;
    let reversalAmount = 0;

    // ─── 3. ATOMIC: mark voided + reverse the adjustment ──
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 3a. Mark tally as voided (INSIDE the same DB transaction)
      await client.query(
        `UPDATE "ShopTally"
            SET "voided" = true,
                "voidReason" = $1,
                "voidedBy" = $2,
                "voidedAt" = $3
          WHERE id = $4`,
        [trimmedReason, auth.userId, now, tallyId]
      );

      // 3b. If the tally had a resolution adjustment, reverse it with a
      //     signed 'balance_adjustment' counter-entry. The original
      //     adjustment is NOT deleted (audit trail) — the counter nets
      //     it out, exactly like a journal reversal in accounting.
      if (origTxn) {
        const origAmount = Number(origTxn.amount);
        // Signed effect of the ORIGINAL adjustment on the balance:
        //   credit                +amount
        //   recovery              -amount
        //   balance_adjustment    ±amount (already signed)
        const origSigned =
          origTxn.type === 'credit' ? origAmount :
          origTxn.type === 'recovery' ? -origAmount :
          origTxn.type === 'balance_adjustment' ? origAmount : 0;

        // Reversal = negation of the original signed effect
        const reversalSigned = Math.round(-origSigned * 100) / 100;
        reversalTxnId = `txn_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
        reversalAmount = reversalSigned;

        // Find current balance (post-resolution; may have been changed
        // by subsequent transactions)
        const curRes = await client.query(
          `SELECT balance FROM "Shop" WHERE id = $1`,
          [tally.shopId]
        );
        const currentBalance = curRes.rows.length > 0 ? Number(curRes.rows[0].balance) : 0;
        const newBalance = Math.round((currentBalance + reversalSigned) * 100) / 100;

        // 3c. Insert reverse adjustment Transaction (SIGNED amount)
        await client.query(
          `INSERT INTO "Transaction"
            (id, "shopId", type, amount, "previousBalance", "newBalance",
             description, status, "createdBy", "approvedBy", "approvedAt", "createdAt", "companyId")
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, $8, NOW(), NOW(), $9)`,
          [
            reversalTxnId,
            tally.shopId,
            'balance_adjustment',
            reversalSigned, // SIGNED: negates the original adjustment
            currentBalance,
            newBalance,
            `Reverse Balance Adjustment — Tally Void (${trimmedReason})`,
            auth.userId,
            origTxn.companyId || null,
          ]
        );

        // 3d. Update Shop.balance to the new computed balance
        await client.query(
          `UPDATE "Shop" SET balance = $1, "updatedAt" = NOW() WHERE id = $2`,
          [newBalance, tally.shopId]
        );

        // 3e. If the original adjustment touched ShopCompanyBalance,
        //     reverse it too: newScb = oldScb - origSigned
        if (origTxn.companyId) {
          const scbRes = await client.query(
            `SELECT id, balance FROM "ShopCompanyBalance"
              WHERE "shopId" = $1 AND "companyId" = $2`,
            [tally.shopId, origTxn.companyId]
          );
          if (scbRes.rows.length > 0) {
            const oldScb = Number(scbRes.rows[0].balance) || 0;
            const newScb = Math.round((oldScb - origSigned) * 100) / 100;
            await client.query(
              `UPDATE "ShopCompanyBalance"
                  SET balance = $1, "updatedAt" = NOW()
                WHERE "shopId" = $2 AND "companyId" = $3`,
              [newScb, tally.shopId, origTxn.companyId]
            );
          }
        }

        // 3f. recalcShopBalances makes sure ALL running balances on
        //     the Transaction table (previousBalance/newBalance cols)
        //     are consistent with the new state.
        const { recalcShopBalances } = await import('@/lib/recalc-balances');
        await recalcShopBalances(client, tally.shopId);

        reversalMade = true;
      }

      await client.query('COMMIT');
    } catch (txnErr) {
      await client.query('ROLLBACK').catch(() => {});
      // Void + reversal rolled back together — admin can retry.
      console.error('[Tally Void] Failed (rolled back):', txnErr);
      return NextResponse.json(
        { error: 'Failed to void tally — all changes were rolled back. Please retry.' },
        { status: 500 }
      );
    } finally {
      client.release();
    }

    // ─── 4. Audit log ────────────────────────────────────
    try {
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "newValue", description)
         VALUES ($1, 'void', 'shopTally', $2, $3, $4)`,
        [
          auditId,
          tallyId,
          JSON.stringify({
            voidReason: trimmedReason,
            voidedBy: auth.userId,
            reversalMade,
            reversalTxnId,
            reversalAmount,
            reversalType: 'balance_adjustment',
          }),
          `Tally ${tallyId} for ${tally.shopName} voided: ${trimmedReason}` +
          (reversalMade
            ? ` — Reversed adjustment via balance_adjustment of ${reversalAmount}`
            : tally.resolutionStatus === 'resolved'
              ? ' — Reversal attempted but no matching adjustment Transaction found'
              : ' — No adjustment to reverse (tally was not resolved)'),
        ]
      );
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      tallyId,
      voided: true,
      voidedAt: now,
      reversalMade,
      reversalTxnId,
      reversalAmount,
      reversalType: reversalMade ? 'balance_adjustment' : null,
    });
  } catch (error) {
    console.error('[Tally Void API] error:', error);
    return NextResponse.json({ error: 'Failed to void tally' }, { status: 500 });
  }
}
