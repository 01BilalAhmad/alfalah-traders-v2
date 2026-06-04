import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

/**
 * GET /api/cron/keep-alive
 *
 * Called by Vercel Cron every 4 minutes to:
 * 1. Keep Neon database warm (prevent cold starts)
 * 2. Keep Vercel serverless function warm
 *
 * This eliminates the 3-8 second cold start penalty that users
 * experience when the database has been idle.
 */
export async function GET() {
  const startTime = Date.now();

  try {
    const pool = getPool();

    // Lightweight query to wake up Neon if sleeping
    const result = await pool.query('SELECT 1 as alive');

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      status: 'ok',
      db: result.rows[0]?.alive === 1 ? 'connected' : 'error',
      responseTimeMs: responseTime,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('[Keep-Alive] Failed:', error);

    return NextResponse.json({
      status: 'error',
      responseTimeMs: responseTime,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
