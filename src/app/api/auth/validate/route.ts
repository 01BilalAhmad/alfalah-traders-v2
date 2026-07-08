import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { verifyToken } from '@/lib/jwt';

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

  // SECURITY: Use JWT verification (supports both JWT and legacy tokens)
  const verified = verifyToken(token);

  if (!verified.valid) {
    return NextResponse.json({
      valid: false,
      message: 'Invalid or expired token.',
    });
  }

  // Verify user exists in database
  try {
    const pool = getPool();

    const res = await pool.query(
      'SELECT id, username, name, role, status FROM "User" WHERE id = $1',
      [verified.userId]
    );

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
    console.error('Token validation error:', error);
    // SECURITY: Return invalid on DB error — never skip token verification
    return NextResponse.json({
      valid: false,
      message: 'Token verification failed due to server error. Please try again.',
    });
  }
}
