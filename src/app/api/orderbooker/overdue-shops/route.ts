import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/orderbooker/overdue-shops?orderbookerId=xxx
// Returns list of overdue shops based on ACTUAL DB transaction data.
//
// A shop is "overdue" if:
//   1. Balance > 0 (has outstanding amount)
//   2. Last approved recovery was 14+ days ago (or never recovered)
//
// This uses the SAME logic as the Aging Report — queries actual Transaction
// table for last recovery date. Works regardless of who posted the recovery.

const OVERDUE_THRESHOLD_DAYS = 14;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderbookerId = searchParams.get('orderbookerId');

    if (!orderbookerId) {
      return NextResponse.json({ error: 'orderbookerId is required' }, { status: 400 });
    }

    const pool = getPool();

    // Get all active shops for this OB with balance > 0
    // PLUS their last recovery date from Transaction table (same as Aging Report)
    const res = await pool.query(
      `SELECT
         s.id AS "shopId",
         s.name AS "shopName",
         s.area AS "shopArea",
         s.address AS "shopAddress",
         s.balance,
         -- Last recovery date (approved) — same logic as Aging Report
         (
           SELECT MAX(t."createdAt")
           FROM "Transaction" t
           WHERE t."shopId" = s.id
             AND t.type = 'recovery'
             AND t.status = 'approved'
         ) AS "lastRecoveryDate",
         -- Last credit date (approved) — for reference
         (
           SELECT MAX(t."createdAt")
           FROM "Transaction" t
           WHERE t."shopId" = s.id
             AND t.type = 'credit'
             AND t.status = 'approved'
         ) AS "lastCreditDate"
       FROM "Shop" s
       WHERE s."orderbookerId" = $1
         AND s.status = 'active'
         AND s.balance > 0`,
      [orderbookerId]
    );

    const now = new Date();
    const overdueShops = [];

    for (const row of res.rows) {
      const balance = Number(row.balance || 0);
      if (balance <= 0) continue;

      const lastRecovery = row.lastRecoveryDate ? new Date(row.lastRecoveryDate) : null;
      let isOverdue = false;
      let daysOverdue = 0;

      if (!lastRecovery) {
        // Never recovered — check if last credit was 14+ days ago
        const lastCredit = row.lastCreditDate ? new Date(row.lastCreditDate) : null;
        if (lastCredit) {
          const diffMs = now.getTime() - lastCredit.getTime();
          daysOverdue = Math.floor(diffMs / (24 * 60 * 60 * 1000));
          isOverdue = daysOverdue >= OVERDUE_THRESHOLD_DAYS;
        } else {
          // No transactions at all but has balance — overdue
          isOverdue = true;
          daysOverdue = 999;
        }
      } else {
        // Has recovery — check if it was 14+ days ago
        const diffMs = now.getTime() - lastRecovery.getTime();
        daysOverdue = Math.floor(diffMs / (24 * 60 * 60 * 1000));
        isOverdue = daysOverdue >= OVERDUE_THRESHOLD_DAYS;
      }

      if (isOverdue) {
        overdueShops.push({
          shopId: row.shopId,
          shopName: row.shopName,
          shopArea: row.shopArea || null,
          shopAddress: row.shopAddress || null,
          balance,
          lastRecoveryDate: lastRecovery ? lastRecovery.toISOString() : null,
          lastCreditDate: row.lastCreditDate ? new Date(row.lastCreditDate).toISOString() : null,
          daysOverdue,
        });
      }
    }

    // Sort: most overdue first (999 = never recovered, then by days descending)
    overdueShops.sort((a, b) => b.daysOverdue - a.daysOverdue);

    return NextResponse.json({
      overdueShops,
      count: overdueShops.length,
      threshold: OVERDUE_THRESHOLD_DAYS,
    });
  } catch (error) {
    console.error('[Overdue Shops API] Error:', error);
    // Return empty array instead of 500 — app should never break
    return NextResponse.json({
      overdueShops: [],
      count: 0,
      threshold: OVERDUE_THRESHOLD_DAYS,
    });
  }
}
