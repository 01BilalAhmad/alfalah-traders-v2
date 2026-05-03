import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// GET /api/auth/validate — Validates if the current session token is valid
export async function GET(request: NextRequest) {
  // Check for Authorization header
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : null;

  // If no token, return basic connectivity check (for APK connection testing)
  if (!token) {
    return NextResponse.json({
      valid: false,
      message: 'No authentication token provided. Server is reachable.',
    });
  }

  // Parse token format: session-{userId}-{timestamp}
  const match = token.match(/^session-(.+)-(\d+)$/);
  if (!match) {
    return NextResponse.json({
      valid: false,
      message: 'Invalid token format.',
    });
  }

  const userId = match[1];
  const timestamp = parseInt(match[2], 10);

  // Check token age (max 7 days)
  const tokenAge = Date.now() - timestamp;
  const MAX_TOKEN_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
  if (tokenAge > MAX_TOKEN_AGE) {
    return NextResponse.json({
      valid: false,
      message: 'Session expired. Please log in again.',
    });
  }

  // Verify user exists in database
  let client;
  try {
    client = getPgClient();
    await client.connect();

    const res = await client.query(
      'SELECT id, username, name, role, status FROM "User" WHERE id = $1',
      [userId]
    );

    await client.end();

    if (res.rows.length === 0) {
      return NextResponse.json({
        valid: false,
        message: 'User not found.',
      });
    }

    const user = res.rows[0];
    if (user.status === 'inactive') {
      return NextResponse.json({
        valid: false,
        message: 'Account is deactivated.',
      });
    }

    return NextResponse.json({
      valid: true,
      message: `Authenticated as ${user.name} (${user.role})`,
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Token validation error:', error);
    // Still return valid for connectivity check, but note DB issue
    return NextResponse.json({
      valid: true,
      message: 'Server reachable (token verification skipped due to database error)',
    });
  }
}
