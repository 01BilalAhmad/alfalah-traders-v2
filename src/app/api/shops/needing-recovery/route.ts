import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// GET /api/shops/needing-recovery?minDays=14&orderbookerId=xxx
// Returns shops where the last recovery was more than minDays ago
export async function GET(request: NextRequest) {
  let client;
  try {
    const { searchParams } = new URL(request.url);
    const minDays = parseInt(searchParams.get('minDays') || '14');
    const orderbookerId = searchParams.get('orderbookerId');

    client = getPgClient();
    await client.connect();

    // Find active shops where the latest approved recovery is older than minDays
    // OR where there has never been a recovery (balance > 0)
    const conditions: string[] = [`s.status = 'active'`, `s.balance > 0`];
    const params: any[] = [];
    let paramIndex = 1;

    if (orderbookerId) {
      conditions.push(`s."orderbookerId" = $${paramIndex++}`);
      params.push(orderbookerId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get shops with their last recovery date
    const shopsRes = await client.query(
      `SELECT s.id, s.name, s.area, s.balance, s."orderbookerId", s.phone,
              u.name AS "orderbookerName",
              lr.last_recovery_date
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
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

    // Filter by minDays
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - minDays);

    const needingRecovery = shopsRes.rows.filter((s: any) => {
      if (!s.last_recovery_date) return true; // Never had a recovery
      const lastRecovery = new Date(s.last_recovery_date);
      return lastRecovery <= cutoff;
    }).map((s: any) => ({
      id: s.id,
      name: s.name,
      area: s.area,
      balance: Number(s.balance),
      phone: s.phone,
      orderbookerId: s.orderbookerId,
      orderbookerName: s.orderbookerName,
      lastRecoveryDate: s.last_recovery_date instanceof Date
        ? s.last_recovery_date.toISOString()
        : s.last_recovery_date,
      daysSinceRecovery: s.last_recovery_date
        ? Math.floor((Date.now() - new Date(s.last_recovery_date).getTime()) / (1000 * 60 * 60 * 24))
        : null,
    }));

    await client.end();
    return NextResponse.json({
      minDays,
      count: needingRecovery.length,
      shops: needingRecovery,
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error fetching shops needing recovery:', error);
    return NextResponse.json({ error: 'Failed to fetch shops needing recovery' }, { status: 500 });
  }
}
