import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/aging
// Aging Report — outstanding balance by age buckets (0-30, 31-60, 61-90, 90+ days)
//
// Query params:
//   - orderbookerId: filter by OB (optional)
//   - companyId: filter by company (optional) — shows per-company balances
//   - search: shop name search (optional)
//
// When companyId is provided:
//   - Shows ShopCompanyBalance per company (not total shop balance)
//   - Age is calculated per-company (last credit/recovery for that company)
//
// Response:
//   {
//     summary: { total, bucket0_30, bucket31_60, bucket61_90, bucket90plus, shopCount },
//     shops: [{ shopId, shopName, area, orderbookerName, balance, ageDays, bucket,
//               lastCreditDate, lastRecoveryDate, companyName, companyBalances[] }]
//   }
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');
    const companyId = searchParams.get('companyId');
    const searchQuery = searchParams.get('search');

    const pool = getPool();

    if (companyId) {
      // ── COMPANY-SPECIFIC AGING ────────────────────────────────
      // Show per-company balance from ShopCompanyBalance table
      // Age calculated from company-specific transactions

      const conditions: string[] = [`scb.balance > 0`, `s.status = 'active'`];
      const params: unknown[] = [];
      let paramIdx = 1;

      conditions.push(`scb."companyId" = $${paramIdx++}`);
      params.push(companyId);

      if (orderbookerId) {
        conditions.push(`s."orderbookerId" = $${paramIdx++}`);
        params.push(orderbookerId);
      }

      if (searchQuery) {
        conditions.push(`s.name ILIKE $${paramIdx++}`);
        params.push(`%${searchQuery}%`);
      }

      const whereClause = conditions.join(' AND ');

      const res = await pool.query(
        `SELECT
           s.id AS "shopId",
           s.name AS "shopName",
           s.area,
           s."orderbookerId",
           u.name AS "orderbookerName",
           scb.balance AS "companyBalance",
           c.name AS "companyName",
           -- Last credit for THIS company
           (SELECT t."createdAt" FROM "Transaction" t
            WHERE t."shopId" = s.id AND t.type = 'credit' AND t.status = 'approved'
              AND t."companyId" = $1
            ORDER BY t."createdAt" DESC LIMIT 1) AS "lastCreditDate",
           -- Last recovery for THIS company
           (SELECT t."createdAt" FROM "Transaction" t
            WHERE t."shopId" = s.id AND t.type = 'recovery' AND t.status = 'approved'
              AND t."companyId" = $1
            ORDER BY t."createdAt" DESC LIMIT 1) AS "lastRecoveryDate",
           -- ALL company balances for this shop (for display)
           (SELECT json_agg(json_build_object(
             'companyName', c2.name,
             'balance', scb2.balance,
             'companyId', scb2."companyId"
           ))
           FROM "ShopCompanyBalance" scb2
           LEFT JOIN "Company" c2 ON scb2."companyId" = c2.id
           WHERE scb2."shopId" = s.id AND scb2.balance > 0) AS "companyBalances"
         FROM "ShopCompanyBalance" scb
         INNER JOIN "Shop" s ON scb."shopId" = s.id
         INNER JOIN "Company" c ON scb."companyId" = c.id
         LEFT JOIN "User" u ON s."orderbookerId" = u.id
         WHERE ${whereClause}
         ORDER BY scb.balance DESC`,
        params
      );

      const now = new Date();
      const shops: any[] = [];
      const summary = {
        total: 0,
        bucket0_30: 0,
        bucket31_60: 0,
        bucket61_90: 0,
        bucket90plus: 0,
        shopCount: 0,
      };

      for (const row of res.rows) {
        const balance = Number(row.companyBalance);
        if (balance <= 0) continue;

        let ageDays = 0;
        let referenceDate: Date | null = null;

        if (row.lastRecoveryDate) {
          referenceDate = new Date(row.lastRecoveryDate);
        } else if (row.lastCreditDate) {
          referenceDate = new Date(row.lastCreditDate);
        }

        if (referenceDate) {
          ageDays = Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
        } else {
          ageDays = 999;
        }

        let bucket: string;
        if (ageDays <= 30) {
          bucket = '0-30';
          summary.bucket0_30 += balance;
        } else if (ageDays <= 60) {
          bucket = '31-60';
          summary.bucket31_60 += balance;
        } else if (ageDays <= 90) {
          bucket = '61-90';
          summary.bucket61_90 += balance;
        } else {
          bucket = '90+';
          summary.bucket90plus += balance;
        }

        summary.total += balance;
        summary.shopCount++;

        shops.push({
          shopId: row.shopId,
          shopName: row.shopName,
          area: row.area || 'Unknown',
          orderbookerName: row.orderbookerName || 'Unassigned',
          balance: Math.round(balance * 100) / 100,
          ageDays,
          bucket,
          companyName: row.companyName,
          companyBalances: row.companyBalances || [],
          lastCreditDate: row.lastCreditDate
            ? (row.lastCreditDate instanceof Date ? row.lastCreditDate.toISOString() : row.lastCreditDate)
            : null,
          lastRecoveryDate: row.lastRecoveryDate
            ? (row.lastRecoveryDate instanceof Date ? row.lastRecoveryDate.toISOString() : row.lastRecoveryDate)
            : null,
        });
      }

      shops.sort((a, b) => b.ageDays - a.ageDays);

      summary.total = Math.round(summary.total * 100) / 100;
      summary.bucket0_30 = Math.round(summary.bucket0_30 * 100) / 100;
      summary.bucket31_60 = Math.round(summary.bucket31_60 * 100) / 100;
      summary.bucket61_90 = Math.round(summary.bucket61_90 * 100) / 100;
      summary.bucket90plus = Math.round(summary.bucket90plus * 100) / 100;

      return NextResponse.json({ summary, shops, mode: 'company' });
    }

    // ── DEFAULT AGING (total shop balance) ─────────────────────
    const conditions: string[] = [`s.balance > 0`, `s.status = 'active'`];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (orderbookerId) {
      conditions.push(`s."orderbookerId" = $${paramIdx++}`);
      params.push(orderbookerId);
    }

    if (searchQuery) {
      conditions.push(`s.name ILIKE $${paramIdx++}`);
      params.push(`%${searchQuery}%`);
    }

    const whereClause = conditions.join(' AND ');

    const res = await pool.query(
      `SELECT
         s.id AS "shopId",
         s.name AS "shopName",
         s.area,
         s.balance,
         s."orderbookerId",
         u.name AS "orderbookerName",
         (SELECT t."createdAt" FROM "Transaction" t
          WHERE t."shopId" = s.id AND t.type = 'credit' AND t.status = 'approved'
          ORDER BY t."createdAt" DESC LIMIT 1) AS "lastCreditDate",
         (SELECT t."createdAt" FROM "Transaction" t
          WHERE t."shopId" = s.id AND t.type = 'recovery' AND t.status = 'approved'
          ORDER BY t."createdAt" DESC LIMIT 1) AS "lastRecoveryDate",
         -- ALL company balances for display
         (SELECT json_agg(json_build_object(
           'companyName', c2.name,
           'balance', scb2.balance,
           'companyId', scb2."companyId"
         ))
         FROM "ShopCompanyBalance" scb2
         LEFT JOIN "Company" c2 ON scb2."companyId" = c2.id
         WHERE scb2."shopId" = s.id AND scb2.balance > 0) AS "companyBalances"
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       WHERE ${whereClause}
       ORDER BY s.balance DESC`,
      params
    );

    const now = new Date();
    const shops: any[] = [];
    const summary = {
      total: 0,
      bucket0_30: 0,
      bucket31_60: 0,
      bucket61_90: 0,
      bucket90plus: 0,
      shopCount: 0,
    };

    for (const row of res.rows) {
      const balance = Number(row.balance);
      if (balance <= 0) continue;

      let ageDays = 0;
      let referenceDate: Date | null = null;

      if (row.lastRecoveryDate) {
        referenceDate = new Date(row.lastRecoveryDate);
      } else if (row.lastCreditDate) {
        referenceDate = new Date(row.lastCreditDate);
      }

      if (referenceDate) {
        ageDays = Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        ageDays = 999;
      }

      let bucket: string;
      if (ageDays <= 30) {
        bucket = '0-30';
        summary.bucket0_30 += balance;
      } else if (ageDays <= 60) {
        bucket = '31-60';
        summary.bucket31_60 += balance;
      } else if (ageDays <= 90) {
        bucket = '61-90';
        summary.bucket61_90 += balance;
      } else {
        bucket = '90+';
        summary.bucket90plus += balance;
      }

      summary.total += balance;
      summary.shopCount++;

      shops.push({
        shopId: row.shopId,
        shopName: row.shopName,
        area: row.area || 'Unknown',
        orderbookerName: row.orderbookerName || 'Unassigned',
        balance: Math.round(balance * 100) / 100,
        ageDays,
        bucket,
        companyBalances: row.companyBalances || [],
        lastCreditDate: row.lastCreditDate
          ? (row.lastCreditDate instanceof Date ? row.lastCreditDate.toISOString() : row.lastCreditDate)
          : null,
        lastRecoveryDate: row.lastRecoveryDate
          ? (row.lastRecoveryDate instanceof Date ? row.lastRecoveryDate.toISOString() : row.lastRecoveryDate)
          : null,
      });
    }

    shops.sort((a, b) => b.ageDays - a.ageDays);

    summary.total = Math.round(summary.total * 100) / 100;
    summary.bucket0_30 = Math.round(summary.bucket0_30 * 100) / 100;
    summary.bucket31_60 = Math.round(summary.bucket31_60 * 100) / 100;
    summary.bucket61_90 = Math.round(summary.bucket61_90 * 100) / 100;
    summary.bucket90plus = Math.round(summary.bucket90plus * 100) / 100;

    return NextResponse.json({ summary, shops, mode: 'total' });
  } catch (error) {
    console.error('[Aging Report] Error:', error);
    return NextResponse.json({ error: 'Failed to generate aging report' }, { status: 500 });
  }
}
