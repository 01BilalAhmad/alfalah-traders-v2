import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAdmin } from '@/lib/auth-guard';

// GET /api/stats — Lightweight stats for sidebar (replaces 3 heavy API calls)
// SECURITY: Admin-only — business metrics shouldn't be public
export async function GET(request: NextRequest) {
  // SECURITY: Handler-level auth check
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const pool = getPool();

    // Run all 3 queries in parallel
    const [shopRes, obRes, txnRes] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM "Shop"'),
      pool.query('SELECT COUNT(*) as count FROM "User" WHERE role = \'orderbooker\' AND status = \'active\''),
      pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM "Transaction"
        WHERE type = 'recovery'
          AND status = 'approved'
          AND "createdAt" >= $1 AND "createdAt" <= $2
      `, [getPakistanTodayStart(), getPakistanTodayEnd()]),
    ]);

    return NextResponse.json({
      totalShops: Number(shopRes.rows[0]?.count || 0),
      totalOBs: Number(obRes.rows[0]?.count || 0),
      todayRecovery: Number(txnRes.rows[0]?.total || 0),
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ totalShops: 0, totalOBs: 0, todayRecovery: 0 }, { status: 500 });
  }
}

// Pakistan timezone helpers (UTC+5, no DST)
function getPakistanTodayStart(): string {
  const now = new Date();
  const pakistanOffset = 5 * 60; // +5 hours in minutes
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const pakistanNow = new Date(utcMs + (pakistanOffset * 60000));
  pakistanNow.setHours(0, 0, 0, 0);
  // Convert back to UTC
  const utcStart = new Date(pakistanNow.getTime() - (pakistanOffset * 60000));
  return utcStart.toISOString();
}

function getPakistanTodayEnd(): string {
  const now = new Date();
  const pakistanOffset = 5 * 60;
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const pakistanNow = new Date(utcMs + (pakistanOffset * 60000));
  pakistanNow.setHours(23, 59, 59, 999);
  const utcEnd = new Date(pakistanNow.getTime() - (pakistanOffset * 60000));
  return utcEnd.toISOString();
}
