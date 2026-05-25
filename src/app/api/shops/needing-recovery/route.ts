import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/shops/needing-recovery?minDays=14&orderbookerId=xxx
// Returns shops where the last CREDIT is older than minDays AND recovery hasn't been done since
// A shop is "overdue" only if it received credit 14+ days ago and still hasn't recovered
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const minDays = parseInt(searchParams.get('minDays') || '14');
    const orderbookerId = searchParams.get('orderbookerId');

    const pool = getPool();

    const conditions: string[] = [`s.status = 'active'`, `s.balance > 0`];
    const params: any[] = [];
    let paramIndex = 1;

    if (orderbookerId) {
      conditions.push(`s."orderbookerId" = $${paramIndex++}`);
      params.push(orderbookerId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get shops with both their last credit date AND last recovery date
    const shopsRes = await pool.query(
      `SELECT s.id, s.name, s.area, s.balance, s."orderbookerId", s.phone,
              u.name AS "orderbookerName",
              lc.last_credit_date,
              lr.last_recovery_date
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       LEFT JOIN (
         SELECT "shopId", MAX("createdAt") AS last_credit_date
         FROM "Transaction"
         WHERE type = 'credit' AND status = 'approved'
         GROUP BY "shopId"
       ) lc ON s.id = lc."shopId"
       LEFT JOIN (
         SELECT "shopId", MAX("createdAt") AS last_recovery_date
         FROM "Transaction"
         WHERE type = 'recovery' AND status = 'approved'
         GROUP BY "shopId"
       ) lr ON s.id = lr."shopId"
       ${whereClause}
       ORDER BY lr.last_recovery_date ASC NULLS FIRST`,
      params
    );

    // Cutoff: minDays ago from now
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - minDays);

    const needingRecovery = shopsRes.rows.filter((s: any) => {
      // If shop has never had a credit, it cannot be overdue for recovery
      if (!s.last_credit_date) return false;

      const lastCredit = new Date(s.last_credit_date);
      // Credit must be older than minDays to be considered overdue
      if (lastCredit > cutoff) return false;

      // If no recovery at all, shop is overdue (credit is 14+ days old)
      if (!s.last_recovery_date) return true;

      // If last recovery is BEFORE last credit, the latest credit hasn't been recovered yet
      const lastRecovery = new Date(s.last_recovery_date);
      return lastRecovery <= lastCredit;
    }).map((s: any) => {
      const lastCredit = s.last_credit_date ? new Date(s.last_credit_date) : null;
      const lastRecovery = s.last_recovery_date ? new Date(s.last_recovery_date) : null;

      return {
        id: s.id,
        name: s.name,
        area: s.area,
        balance: Number(s.balance),
        phone: s.phone,
        orderbookerId: s.orderbookerId,
        orderbookerName: s.orderbookerName,
        lastCreditDate: lastCredit ? lastCredit.toISOString() : null,
        lastRecoveryDate: lastRecovery ? lastRecovery.toISOString() : null,
        daysSinceCredit: lastCredit
          ? Math.floor((Date.now() - lastCredit.getTime()) / (1000 * 60 * 60 * 24))
          : null,
        daysSinceRecovery: lastRecovery
          ? Math.floor((Date.now() - lastRecovery.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      };
    });

    return NextResponse.json({
      minDays,
      count: needingRecovery.length,
      shops: needingRecovery,
    });
  } catch (error) {
    console.error('Error fetching shops needing recovery:', error);
    return NextResponse.json({ error: 'Failed to fetch shops needing recovery' }, { status: 500 });
  }
}
