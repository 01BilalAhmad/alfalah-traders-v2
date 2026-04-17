import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';
import crypto from 'crypto';

// GET /api/mobile/sync?userId=xxx — Initial sync: download shops + user info
export async function GET(request: NextRequest) {
  let client;
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    client = getPgClient();
    await client.connect();

    // Fetch user info
    const userRes = await client.query(
      'SELECT id, username, name, role, phone, status FROM "User" WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const user = userRes.rows[0];

    // Fetch shops assigned to this orderbooker (or all if admin)
    let shopQuery: string;
    let shopParams: any[];

    if (user.role === 'admin') {
      shopQuery = `SELECT s.*, u.name AS "ob_name"
                   FROM "Shop" s
                   LEFT JOIN "User" u ON s."orderbookerId" = u.id
                   WHERE s.status = 'active'
                   ORDER BY s.name ASC`;
      shopParams = [];
    } else {
      shopQuery = `SELECT s.*, u.name AS "ob_name"
                   FROM "Shop" s
                   LEFT JOIN "User" u ON s."orderbookerId" = u.id
                   WHERE s."orderbookerId" = $1 AND s.status = 'active'
                   ORDER BY s.name ASC`;
      shopParams = [userId];
    }

    const shopRes = await client.query(shopQuery, shopParams);

    // Fetch today's transactions for this user
    const todayTxnRes = await client.query(
      `SELECT t.*, s.name AS "shop_name"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       WHERE t."createdBy" = $1 AND t."createdAt" >= CURRENT_DATE
       ORDER BY t."createdAt" DESC`,
      [userId]
    );

    // Fetch today's recovery total
    const recoveryTotalRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS "todayTotalRecovery"
       FROM "Transaction"
       WHERE "createdBy" = $1 AND type = 'recovery' AND status = 'approved' AND "createdAt" >= CURRENT_DATE`,
      [userId]
    );

    await client.end();

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        phone: user.phone,
        status: user.status,
      },
      shops: shopRes.rows.map((s: any) => ({
        id: s.id,
        name: s.name,
        ownerName: s.ownerName,
        area: s.area,
        address: s.address,
        phone: s.phone,
        routeDay: s.routeDay,
        orderbookerId: s.orderbookerId,
        balance: Number(s.balance),
        creditLimit: Number(s.creditLimit),
        status: s.status,
        orderbookerName: s.ob_name,
      })),
      todayTransactions: todayTxnRes.rows.map((t: any) => ({
        id: t.id,
        shopId: t.shopId,
        shopName: t.shop_name,
        type: t.type,
        amount: Number(t.amount),
        status: t.status,
        description: t.description,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
      })),
      todayTotalRecovery: Number(recoveryTotalRes.rows[0].todayTotalRecovery),
      syncTime: new Date().toISOString(),
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Mobile sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

// POST /api/mobile/sync — Bulk sync: push unsynced transactions to server
export async function POST(request: NextRequest) {
  let client;
  try {
    const { transactions } = await request.json();

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ error: 'No transactions to sync' }, { status: 400 });
    }

    client = getPgClient();
    await client.connect();

    const results: any[] = [];
    const errors: any[] = [];

    for (const txn of transactions) {
      try {
        // Map mobile app fields to server fields
        const shopId = txn.shopId;
        const createdBy = txn.bookerId || txn.createdBy || 'unknown';
        const amount = Number(txn.amount);
        const type = txn.type || 'recovery';
        const description = txn.note || txn.description || '';

        // Get current shop balance
        const shopRes = await client.query('SELECT balance FROM "Shop" WHERE id = $1', [shopId]);
        if (shopRes.rows.length === 0) {
          errors.push({ shopId, error: 'Shop not found' });
          continue;
        }

        const currentBalance = Number(shopRes.rows[0].balance);
        const previousBalance = currentBalance;
        let newBalance = currentBalance;

        if (type === 'credit') {
          newBalance = currentBalance + amount;
        } else if (type === 'recovery') {
          if (amount > currentBalance) {
            errors.push({ shopId, amount, error: `Recovery Rs.${amount} exceeds balance Rs.${currentBalance}` });
            continue;
          }
          // Recovery is always pending initially
          newBalance = currentBalance; // Balance doesn't change until approved
        }

        const txnId = `txn_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
        await client.query(
          `INSERT INTO "Transaction" (id, "shopId", type, status, amount, "previousBalance", "newBalance", description, "createdBy", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
          [txnId, shopId, type, type === 'credit' ? 'approved' : 'pending', amount, previousBalance, newBalance, description, createdBy]
        );

        // Update shop balance only for credits
        if (type === 'credit') {
          await client.query('UPDATE "Shop" SET balance = $1 WHERE id = $2', [newBalance, shopId]);
        }

        results.push({
          localId: txn.id,
          serverId: txnId,
          shopId,
          type,
          amount,
          status: type === 'credit' ? 'approved' : 'pending',
          success: true,
        });
      } catch (txnError: any) {
        errors.push({ shopId: txn.shopId, error: txnError.message });
      }
    }

    await client.end();

    return NextResponse.json({
      synced: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Bulk sync error:', error);
    return NextResponse.json({ error: 'Bulk sync failed' }, { status: 500 });
  }
}
