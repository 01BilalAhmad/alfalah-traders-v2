import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/ledger?shopId=xxx&companyId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get('shopId');
    const companyId = searchParams.get('companyId');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    if (!shopId) {
      return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
    }

    const pool = getPool();

    // Fetch shop with orderbooker info + company balances
    const shopRes = await pool.query(
      `SELECT s.*, u.id AS "ob_id", u.name AS "ob_name", u.phone AS "ob_phone"
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       WHERE s.id = $1`,
      [shopId]
    );

    if (shopRes.rows.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const shop = shopRes.rows[0];

    // Fetch company balances for this shop
    let companyBalances: { companyId: string; companyName: string; balance: number }[] = [];
    try {
      const scbRes = await pool.query(
        `SELECT scb."companyId", c.name AS "companyName", scb.balance
         FROM "ShopCompanyBalance" scb
         LEFT JOIN "Company" c ON scb."companyId" = c.id
         WHERE scb."shopId" = $1 AND scb.balance > 0
         ORDER BY c.name`,
        [shopId]
      );
      companyBalances = scbRes.rows.map((r: any) => ({
        companyId: r.companyId,
        companyName: r.companyName,
        balance: Number(r.balance),
      }));
    } catch { /* ShopCompanyBalance might not exist */ }

    // Fetch transactions with creator info + company info
    // Only show approved + pending transactions (exclude rejected)
    const conditions: string[] = [`t."shopId" = $1`, `t.status != 'rejected'`];
    const txnParams: any[] = [shopId];
    let paramIndex = 2;

    if (companyId) {
      conditions.push(`t."companyId" = $${paramIndex++}`);
      txnParams.push(companyId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    let txnQuery = `SELECT t.*, u.id AS "creator_id", u.name AS "creator_name", u.role AS "creator_role",
                           co.id AS "company_id", co.name AS "company_name"
                    FROM "Transaction" t
                    LEFT JOIN "User" u ON t."createdBy" = u.id
                    LEFT JOIN "Company" co ON t."companyId" = co.id
                    ${whereClause}
                    ORDER BY t."createdAt" ASC`;

    if (limit && limit > 0) {
      txnQuery += ` LIMIT $${paramIndex++}`;
      txnParams.push(limit);
    }

    const txnRes = await pool.query(txnQuery, txnParams);
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
      companyId: t.companyId || null,
      createdAt: t.createdAt,
      creator: {
        id: t.creator_id,
        name: t.creator_name,
        role: t.creator_role,
      },
      company: t.company_id ? {
        id: t.company_id,
        name: t.company_name,
      } : null,
    }));

    const totalCredit = transactions.filter((t: any) => t.type === 'credit' && t.status === 'approved').reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalRecovery = transactions.filter((t: any) => t.type === 'recovery' && t.status === 'approved').reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalClaims = transactions.filter((t: any) => t.type === 'claim' && t.status === 'approved').reduce((s: number, t: any) => s + Number(t.amount), 0);
    const approvedCount = transactions.filter((t: any) => t.status === 'approved').length;

    // If filtered by company, calculate the company-specific balance
    let currentBalance = Number(shop.balance);
    if (companyId) {
      const companyBal = companyBalances.find(cb => cb.companyId === companyId);
      currentBalance = companyBal ? companyBal.balance : 0;
    }

    return NextResponse.json({
      shop: {
        id: shop.id,
        name: shop.name,
        ownerName: shop.ownerName,
        area: shop.area,
        address: shop.address,
        phone: shop.phone,
        routeDays: shop.routeDays || [],
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
        totalClaims: Math.round(totalClaims * 100) / 100,
        totalTransactions: approvedCount,
        currentBalance: Math.round(currentBalance * 100) / 100,
      },
      companyBalances,
    });
  } catch (error) {
    console.error('Error generating ledger:', error);
    return NextResponse.json({ error: 'Failed to generate ledger' }, { status: 500 });
  }
}
