import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';
import crypto from 'crypto';

// GET /api/mobile/sync?userId=xxx
// Returns all data for a specific orderbooker (shops + recent transactions)
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

    // 1. Get all shops assigned to this orderbooker (active + inactive)
    const shopRes = await client.query(
      `SELECT s.*, u.name AS "ob_name"
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       WHERE s."orderbookerId" = $1
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
      routeDay: s.routeDay,
      orderbookerId: s.orderbookerId,
      balance: Number(s.balance),
      creditLimit: Number(s.creditLimit),
      status: s.status,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
      orderbookerName: s.ob_name,
    }));

    // 2. Get recent transactions for this orderbooker (last 200)
    const txRes = await client.query(
      `SELECT t.*, s.name AS "shopName", u.name AS "createdByName"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       LEFT JOIN "User" u ON t."createdBy" = u.id
       WHERE t."createdBy" = $1
       ORDER BY t."createdAt" DESC
       LIMIT 200`,
      [userId]
    );

    const transactions = txRes.rows.map((t: any) => ({
      id: t.id,
      shopId: t.shopId,
      shopName: t.shopName,
      type: t.type,
      amount: Number(t.amount),
      balanceAfter: t.balanceAfter ? Number(t.balanceAfter) : null,
      description: t.description,
      note: t.note,
      status: t.status,
      createdBy: t.createdBy,
      createdByName: t.createdByName,
      approvedBy: t.approvedBy,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
      updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
    }));

    // 3. Get user info
    const userRes = await client.query(
      'SELECT id, username, name, role, phone, status, "allRoutesEnabled" FROM "User" WHERE id = $1',
      [userId]
    );
    const user = userRes.rows[0];

    // 4. Get shop notes for this orderbooker's shops
    let shopNotes: any[] = [];
    try {
      const notesRes = await client.query(
        `SELECT n.id, n."shopId", n.note, n."createdBy", n."createdAt", n."updatedAt"
         FROM "ShopNote" n
         INNER JOIN "Shop" s ON n."shopId" = s.id
         WHERE s."orderbookerId" = $1
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
    } catch { /* ShopNote table may not exist yet */ }

    // 5. Get daily target for current month
    let dailyTarget: any = null;
    try {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const targetRes = await client.query(
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
      const prefRes = await client.query(
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

    await client.end();

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
      } : null,
      shopNotes,
      dailyTarget,
      userPreferences,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error in mobile sync GET:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

// POST /api/mobile/sync
// Accepts pending transactions from mobile to sync to server
export async function POST(request: NextRequest) {
  let client;
  try {
    const body = await request.json();
    const { transactions } = body;

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json({ error: 'transactions array is required' }, { status: 400 });
    }

    client = getPgClient();
    await client.connect();

    const results = [];
    const errors = [];

    for (const tx of transactions) {
      try {
        const txId = `tx_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
        const now = new Date().toISOString();

        const txRes = await client.query(
          `INSERT INTO "Transaction" (id, "shopId", type, amount, description, "createdBy", status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            txId,
            tx.shopId,
            tx.type || 'recovery',
            tx.amount,
            tx.description || 'Mobile sync recovery',
            tx.createdBy,
            'pending', // Recoveries need admin approval
            now,
            now,
          ]
        );

        results.push({
          localId: tx.localId,
          serverId: txRes.rows[0].id,
          success: true,
        });
      } catch (err: any) {
        errors.push({
          localId: tx.localId,
          error: err.message,
        });
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
    console.error('Error in mobile sync POST:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
