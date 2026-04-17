import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;

// GET /api/recoveries?status=pending&orderbookerId=xxx
export async function GET(request: NextRequest) {
  let client;
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const orderbookerId = searchParams.get('orderbookerId');

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const conditions: string[] = [`t.type = 'recovery'`, `t.status = $1`];
    const params: any[] = [status];
    let paramIndex = 2;

    if (orderbookerId) {
      conditions.push(`t."createdBy" = $${paramIndex++}`);
      params.push(orderbookerId);
    }

    const whereClause = conditions.join(' AND ');

    const txnRes = await client.query(
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

    await client.end();
    return NextResponse.json({
      transactions,
      grouped: Object.values(grouped),
      totalPending,
      totalAmount,
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error fetching recoveries:', error);
    return NextResponse.json({ error: 'Failed to fetch recoveries' }, { status: 500 });
  }
}

// POST /api/recoveries - Approve or reject recoveries (single or bulk)
export async function POST(request: NextRequest) {
  let client;
  try {
    const { action, transactionIds, approvedBy, rejectReason } = await request.json();

    if (!action || !transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0 || !approvedBy) {
      return NextResponse.json({ error: 'Action, transactionIds, and approvedBy are required' }, { status: 400 });
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Action must be "approve" or "reject"' }, { status: 400 });
    }

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    await client.query('BEGIN');

    // Fetch all pending transactions with shop info
    const placeholders = transactionIds.map((_: unknown, idx: number) => `$${idx + 1}`).join(', ');
    const pendingRes = await client.query(
      `SELECT t.*, s.id AS "shop_db_id", s.name AS "shop_name", s.balance AS "shop_balance"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       WHERE t.id IN (${placeholders}) AND t.type = 'recovery' AND t.status = 'pending'`,
      transactionIds
    );

    if (pendingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      await client.end();
      return NextResponse.json({ error: 'No pending recoveries found' }, { status: 404 });
    }

    if (pendingRes.rows.length !== transactionIds.length) {
      await client.query('ROLLBACK');
      await client.end();
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
        const newBalance = Math.round((Number(txn.shop_balance) - Number(txn.amount)) * 100) / 100;

        await client.query(
          `UPDATE "Transaction" SET status = 'approved', "approvedBy" = $1, "approvedAt" = $2, "newBalance" = $3 WHERE id = $4`,
          [approvedBy, now, newBalance, txn.id]
        );

        await client.query(
          `UPDATE "Shop" SET balance = $1 WHERE id = $2`,
          [newBalance, txn.shopId]
        );

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

    await client.query('COMMIT');

    // Create audit log
    try {
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
          `${action === 'approve' ? 'Approved' : 'Rejected'} ${pendingRes.rows.length} recovery(ies) totaling Rs. ${Math.round(totalAmount)}`,
        ]
      );
    } catch { /* non-blocking */ }

    await client.end();
    return NextResponse.json({
      success: true,
      processed: results.length,
      action,
      results,
    });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
      await client.end().catch(() => {});
    }
    console.error('Error processing recovery action:', error);
    return NextResponse.json({ error: 'Failed to process recovery action' }, { status: 500 });
  }
}
