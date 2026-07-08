import { NextRequest, NextResponse } from 'next/server';
import { getPool, getClient } from '@/lib/pg';
import crypto from 'crypto';
import { recalcShopBalances } from '@/lib/recalc-balances';

// POST /api/transactions/supplier-collection
// Post a supplier collection (balance deduction) for a shop.
// This is when a supplier collects money directly from a shop keeper
// (previous balance clearance). It's separate from OB recovery so
// it doesn't show up in OB Recovery Reports.
//
// Body: { shopId, amount, description, companyId }
// companyId is REQUIRED.
// Status is auto-approved (admin posting).
export async function POST(request: NextRequest) {
  try {
    const createdBy = request.headers.get('x-auth-userid');
    const { shopId, amount, description, companyId } = await request.json();

    if (!shopId || !amount || !createdBy || !companyId) {
      return NextResponse.json(
        { error: 'shopId, amount, companyId, and authentication are required' },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Fetch shop
      const shopRes = await client.query('SELECT id, name, balance FROM "Shop" WHERE id = $1', [shopId]);
      if (shopRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
      }
      const shop = shopRes.rows[0];

      // Fetch company balance
      const scbRes = await client.query(
        'SELECT id, balance FROM "ShopCompanyBalance" WHERE "shopId" = $1 AND "companyId" = $2',
        [shopId, companyId]
      );

      const previousBalance = scbRes.rows.length > 0 ? Number(scbRes.rows[0].balance) : 0;
      const newBalance = previousBalance - amount;

      // Create transaction
      const txnId = `txn_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      const txnRes = await client.query(
        `INSERT INTO "Transaction" (id, "shopId", type, status, amount, "previousBalance", "newBalance", description, "createdBy", "companyId", "createdAt")
         VALUES ($1, $2, 'supplier_collection', 'approved', $3, $4, $5, $6, $7, $8, NOW())
         RETURNING *`,
        [txnId, shopId, amount, previousBalance, newBalance, description || 'Supplier collection', createdBy, companyId]
      );
      const transaction = txnRes.rows[0];

      // Update ShopCompanyBalance
      if (scbRes.rows.length > 0) {
        await client.query(
          'UPDATE "ShopCompanyBalance" SET balance = $1, "updatedAt" = NOW() WHERE id = $2',
          [newBalance, scbRes.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO "ShopCompanyBalance" (id, "shopId", "companyId", balance, "creditLimit", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, 0, NOW(), NOW())`,
          [shopId, companyId, newBalance]
        );
      }

      // Update Shop balance
      const mainNewBalance = Number(shop.balance) - amount;
      await client.query('UPDATE "Shop" SET balance = $1, "updatedAt" = NOW() WHERE id = $2', [mainNewBalance, shopId]);

      // Audit log (inside transaction — C6 fix)
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await client.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "performedBy", "newValue", description)
         VALUES ($1, 'supplier_collection', 'transaction', $2, $3, $4, $5)`,
        [
          auditId, transaction.id, createdBy,
          JSON.stringify({ type: 'supplier_collection', amount, shopId, companyId, description }),
          `Supplier collection posted: Rs. ${amount.toLocaleString()} for shop "${shop.name}"`,
        ]
      );

      // Recalc balances (blocking — H3 fix)
      await recalcShopBalances(client, shopId);

      await client.query('COMMIT');

      return NextResponse.json({
        ...transaction,
        type: 'supplier_collection',
        status: 'approved',
        amount: Number(transaction.amount),
        previousBalance: Number(transaction.previousBalance),
        newBalance: Number(transaction.newBalance),
      }, { status: 201 });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error posting supplier collection:', error);
    return NextResponse.json(
      { error: `Failed to post supplier collection: ${(error as Error)?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
