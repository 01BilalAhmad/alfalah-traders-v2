import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/pg';
import crypto from 'crypto';
import { recalcShopBalances } from '@/lib/recalc-balances';

// PATCH /api/transactions/edit-pending — Edit a pending recovery (orderbooker side)
// IMPORTANT: Pending recoveries do NOT affect shop balance, so this route
// only updates the transaction amount/description without touching Shop.balance
// or ShopCompanyBalance. This is the SAFE way to edit pending recoveries.
export async function PATCH(request: NextRequest) {
  try {
    const { id, amount, description, updatedBy } = await request.json();

    // === Validation ===
    if (!id || !updatedBy) {
      return NextResponse.json({ error: 'Transaction ID and updater are required' }, { status: 400 });
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 });
    }

    if (amount < 100) {
      return NextResponse.json({ error: 'Minimum recovery amount is Rs. 100' }, { status: 400 });
    }

    if (amount > 500000) {
      return NextResponse.json({ error: 'Maximum recovery amount is Rs. 500,000' }, { status: 400 });
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // === Fetch existing transaction ===
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

      // === Safety check: Only allow editing PENDING RECOVERIES ===
      if (existingTxn.type !== 'recovery') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Only recovery transactions can be edited with this endpoint' }, { status: 400 });
      }

      if (existingTxn.status !== 'pending') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Only pending recoveries can be edited. Approved recoveries cannot be modified.' }, { status: 400 });
      }

      const oldAmount = Number(existingTxn.amount);

      // No change? Return early
      if (amount === oldAmount && (description === undefined || description === existingTxn.description)) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          id: existingTxn.id,
          amount: oldAmount,
          message: 'No changes detected',
        });
      }

      // === CRITICAL: Pending recoveries do NOT affect Shop.balance ===
      // When a recovery is created as "pending", the shop balance is NOT deducted.
      // So when editing a pending recovery, we must NOT reverse/re-apply any balance changes.
      // We only update the Transaction record itself.
      //
      // Compare with the POST handler:
      //   - Credit: newBalance = previousBalance + amount (immediate)
      //   - Approved recovery: newBalance = previousBalance - amount (immediate)
      //   - Pending recovery: newBalance = previousBalance (NO deduction until approved)
      //
      // And compare with the DELETE handler which correctly handles this:
      //   - If pending recovery: newShopBalance = shopBalance (no reversal needed)

      const shopBalance = Number(existingTxn.shop_balance);

      // The previousBalance on the transaction record was the shop balance at the time of creation.
      // For a pending recovery, newBalance = previousBalance (no deduction).
      // When we change the amount, the newBalance should still equal previousBalance
      // because the recovery is still pending — it hasn't been applied to balance yet.
      // However, we update newBalance to reflect what WOULD happen if approved at this amount,
      // for display/audit purposes. The actual balance change happens only on approval.
      const previousBalance = Number(existingTxn.previousBalance);
      const newBalance = previousBalance - amount; // This is the projected balance if approved

      // Update only the transaction record — do NOT touch Shop.balance or ShopCompanyBalance
      const newDesc = description !== undefined ? description : existingTxn.description;
      await client.query(
        `UPDATE "Transaction" SET amount = $1, description = $2, "newBalance" = $3 WHERE id = $4`,
        [amount, newDesc, Math.round(newBalance * 100) / 100, id]
      );

      // ═══ FIX H3: Recalc is now BLOCKING (see transactions/route.ts POST) ═══
      const recalcResult = await recalcShopBalances(client, existingTxn.shopId);
      console.log(`[PATCH /api/transactions/edit-pending] Recalculated shop ${existingTxn.shopId}: ${recalcResult.transactionsUpdated} txns`);

      // ═══ FIX C6: Audit log INSIDE the transaction (before COMMIT) ═══
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await client.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "performedBy", "oldValue", "newValue", description)
         VALUES ($1, 'edit_pending_recovery', 'transaction', $2, $3, $4, $5, $6)`,
        [
          auditId,
          id,
          updatedBy,
          JSON.stringify({
            shopName: existingTxn.shop_name,
            type: 'recovery',
            status: 'pending',
            amount: oldAmount,
            description: existingTxn.description,
          }),
          JSON.stringify({
            shopName: existingTxn.shop_name,
            type: 'recovery',
            status: 'pending',
            amount,
            description: newDesc,
          }),
          `Pending recovery edited by orderbooker: Rs. ${oldAmount} -> Rs. ${amount} at ${existingTxn.shop_name}`,
        ]
      );

      await client.query('COMMIT');

      return NextResponse.json({
        id: existingTxn.id,
        amount,
        message: `Pending recovery updated from Rs. ${oldAmount.toLocaleString()} to Rs. ${amount.toLocaleString()}`,
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error editing pending recovery:', error);
      return NextResponse.json({ error: 'Failed to update pending recovery' }, { status: 500 });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error editing pending recovery:', error);
    return NextResponse.json({ error: 'Failed to update pending recovery' }, { status: 500 });
  }
}
