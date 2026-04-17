import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';

const { Client } = pg;

// GET /api/reports/ledger?shopId=xxx
export async function GET(request: NextRequest) {
  let client;
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get('shopId');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    if (!shopId) {
      return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
    }

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // Fetch shop with orderbooker info
    const shopRes = await client.query(
      `SELECT s.*, u.id AS "ob_id", u.name AS "ob_name", u.phone AS "ob_phone"
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       WHERE s.id = $1`,
      [shopId]
    );

    if (shopRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const shop = shopRes.rows[0];

    // Fetch transactions with creator info
    let txnQuery = `SELECT t.*, u.id AS "creator_id", u.name AS "creator_name", u.role AS "creator_role"
                    FROM "Transaction" t
                    LEFT JOIN "User" u ON t."createdBy" = u.id
                    WHERE t."shopId" = $1
                    ORDER BY t."createdAt" ASC`;
    const txnParams: any[] = [shopId];

    if (limit && limit > 0) {
      txnQuery += ` LIMIT $2`;
      txnParams.push(limit);
    }

    const txnRes = await client.query(txnQuery, txnParams);
    const transactions: any[] = txnRes.rows;

    // Map transactions to match the previous Prisma output shape
    const mappedTransactions = transactions.map((t: any) => ({
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
      createdAt: t.createdAt,
      creator: {
        id: t.creator_id,
        name: t.creator_name,
        role: t.creator_role,
      },
    }));

    const totalCredit = transactions.filter((t: any) => t.type === 'credit').reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalRecovery = transactions.filter((t: any) => t.type === 'recovery').reduce((s: number, t: any) => s + Number(t.amount), 0);

    await client.end();
    return NextResponse.json({
      shop: {
        id: shop.id,
        name: shop.name,
        ownerName: shop.ownerName,
        area: shop.area,
        address: shop.address,
        phone: shop.phone,
        routeDay: shop.routeDay,
        balance: Number(shop.balance),
        orderbooker: shop.ob_id ? {
          id: shop.ob_id,
          name: shop.ob_name,
          phone: shop.ob_phone,
        } : null,
      },
      transactions: mappedTransactions,
      summary: {
        totalCredit: Math.round(totalCredit * 100) / 100,
        totalRecovery: Math.round(totalRecovery * 100) / 100,
        totalTransactions: transactions.length,
        currentBalance: Number(shop.balance),
      },
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error generating ledger:', error);
    return NextResponse.json({ error: 'Failed to generate ledger' }, { status: 500 });
  }
}
