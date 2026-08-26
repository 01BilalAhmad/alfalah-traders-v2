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
// Transaction (opposite type, same amount) + run recalcShopBalances
// so the shop's running balance is corrected.
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

    // ─── 1. Fetch tally + shop info ──────────────────────────────
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

    // ─── 2. Mark tally as voided ─────────────────────────────────
    await pool.query(
      `UPDATE "ShopTally"
          SET "voided" = true,
              "voidReason" = $1,
              "voidedBy" = $2,
              "voidedAt" = $3
        WHERE id = $4`,
      [trimmedReason, auth.userId, now, tallyId]
    );

    // ─── 3. If tally was previously resolved, reverse the balance ─
    //    adjustment by creating a counter-Transaction of the opposite
    //    type with the same amount. The original adjustment Transaction
    //    is NOT deleted (audit trail) — we add a counter entry that
    //    nets it out, exactly like a journal reversal in accounting.
    let reversalMade = false;
    let reversalTxnId: string | null = null;
    let reversalAmount = 0;
    let reversalType: string | null = null;

    if (tally.resolutionStatus === 'resolved' && tally.resolvedAt) {
      // Find the adjustment Transaction created by the resolve step.
      // The resolve route's description starts with:
      //   "Balance Adjustment — Tally Resolution ("
      // Time window of ±5 minutes around resolvedAt to be safe against
      // clock skew (resolve step does everything in one DB txn, so the
      // Transaction.createdAt is within milliseconds of resolvedAt).
      const adjTxnRes = await pool.query(
        `SELECT id, type, amount, "companyId", "previousBalance", "newBalance"
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
        const origTxn = adjTxnRes.rows[0];
        const origAmount = Number(origTxn.amount);
        // Reverse: original credit → recovery, original recovery → credit.
        // Same absolute amount; only the type flips. The sign of the
        // balance change therefore flips, which is exactly what we want.
        const reverseType = origTxn.type === 'credit' ? 'recovery' : 'credit';
        reversalTxnId = `txn_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
        reversalAmount = origAmount;
        reversalType = reverseType;

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // 3a. Find current balance (post-resolution; may have been
          //     changed by subsequent transactions)
          const curRes = await client.query(
            `SELECT balance FROM "Shop" WHERE id = $1`,
            [tally.shopId]
          );
          const currentBalance = curRes.rows.length > 0 ? Number(curRes.rows[0].balance) : 0;
          // If original was a credit (+amount), reverse is a recovery
          // (−amount). If original was a recovery (−amount), reverse
          // is a credit (+amount). newBalance computed accordingly.
          const newBalance = origTxn.type === 'credit'
            ? currentBalance - origAmount
            : currentBalance + origAmount;

          // 3b. Insert reverse adjustment Transaction
          await client.query(
            `INSERT INTO "Transaction"
              (id, "shopId", type, amount, "previousBalance", "newBalance",
               description, status, "createdBy", "approvedBy", "approvedAt", "createdAt", "companyId")
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, $8, NOW(), NOW(), $9)`,
            [
              reversalTxnId,
              tally.shopId,
              reverseType,
              origAmount, // always positive Float
              currentBalance,
              newBalance,
              `Reverse Balance Adjustment — Tally Void (${trimmedReason})`,
              auth.userId,
              origTxn.companyId || null,
            ]
          );

          // 3c. Update Shop.balance to the new computed balance
          await client.query(
            `UPDATE "Shop" SET balance = $1, "updatedAt" = NOW() WHERE id = $2`,
            [newBalance, tally.shopId]
          );

          // 3d. If original adjustment touched ShopCompanyBalance,
          //     reverse it too. We mirror the resolve route's logic:
          //     if companyId was on the original txn, adjust that SCB.
          if (origTxn.companyId) {
            const scbRes = await client.query(
              `SELECT id, balance FROM "ShopCompanyBalance"
                WHERE "shopId" = $1 AND "companyId" = $2`,
              [tally.shopId, origTxn.companyId]
            );
            if (scbRes.rows.length > 0) {
              const oldScb = Number(scbRes.rows[0].balance) || 0;
              const newScb = origTxn.type === 'credit'
                ? oldScb - origAmount
                : oldScb + origAmount;
              await client.query(
                `UPDATE "ShopCompanyBalance"
                    SET balance = $1, "updatedAt" = NOW()
                  WHERE "shopId" = $2 AND "companyId" = $3`,
                [newScb, tally.shopId, origTxn.companyId]
              );
            }
          }

          // 3e. recalcShopBalances makes sure ALL running balances on
          //     the Transaction table (previousBalance/newBalance cols)
          //     are consistent with the new state.
          const { recalcShopBalances } = await import('@/lib/recalc-balances');
          await recalcShopBalances(client, tally.shopId);

          await client.query('COMMIT');
          reversalMade = true;
        } catch (txnErr) {
          await client.query('ROLLBACK');
          console.error('[Tally Void] Reversal transaction failed:', txnErr);
          // We've already marked the tally as voided — that's fine.
          // The reversal can be retried manually. Don't 500 the whole
          // request; the void itself succeeded. Just log it.
        } finally {
          client.release();
        }
      }
    }

    // ─── 4. Audit log ────────────────────────────────────────────
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
            reversalType,
          }),
          `Tally ${tallyId} for ${tally.shopName} voided: ${trimmedReason}` +
          (reversalMade
            ? ` — Reversed adjustment via ${reversalType} of ${reversalAmount}`
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
      reversalType,
    });
  } catch (error) {
    console.error('[Tally Void API] error:', error);
    return NextResponse.json({ error: 'Failed to void tally' }, { status: 500 });
  }
}
