import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/admin/email-config/status — Check if email is configured (PUBLIC — used on login page)
export async function GET() {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT "isConfigured" FROM "EmailConfig" WHERE "isConfigured" = true LIMIT 1'
    );
    return NextResponse.json({ configured: result.rows.length > 0 });
  } catch {
    // If EmailConfig table doesn't exist yet, email is not configured
    return NextResponse.json({ configured: false });
  }
}
