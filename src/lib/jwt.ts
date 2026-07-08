/**
 * JWT Token Utility for Finexa
 *
 * SECURITY: Replaces the insecure session-{userId}-{timestamp} token format
 * with cryptographically signed JWT tokens.
 *
 * BACKWARD COMPATIBILITY: The verify function accepts BOTH old-format tokens
 * and new JWT tokens. This allows a gradual migration:
 * - Old APK versions still send old-format tokens → they work
 * - New web/APK send JWT tokens → they work
 * - After all users migrate, old format can be disabled
 */

import jwt from 'jsonwebtoken';

// ─── Configuration ──────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'finexa-default-secret-change-in-production';
const JWT_EXPIRES_IN = '7d'; // 7 days — matches old token age
const OLD_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// SECURITY: Warn if using default JWT secret (not configured via env var)
if (JWT_SECRET === 'finexa-default-secret-change-in-production' && process.env.NODE_ENV === 'production') {
  console.error('⚠️  SECURITY WARNING: JWT_SECRET is not set! Using default secret — tokens can be forged.');
  console.error('⚠️  Set JWT_SECRET environment variable immediately.');
}

// ─── Types ──────────────────────────────────────────────────────
export interface TokenPayload {
  userId: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface VerifyResult {
  valid: boolean;
  userId: string | null;
  role: string | null;
  isLegacy: boolean; // true if old-format token was used
}

// ─── Generate JWT ───────────────────────────────────────────────
/**
 * Generate a signed JWT token for a user.
 * Called during login.
 */
export function generateToken(userId: string, role: string): string {
  return jwt.sign(
    { userId, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ─── Verify Token (supports both JWT and old format) ───────────
/**
 * Verify a token — supports both JWT and legacy session-{userId}-{timestamp} format.
 * Returns decoded payload if valid, null if invalid.
 */
export function verifyToken(token: string): VerifyResult {
  if (!token) {
    return { valid: false, userId: null, role: null, isLegacy: false };
  }

  // Try JWT format first
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return {
      valid: true,
      userId: decoded.userId,
      role: decoded.role,
      isLegacy: false,
    };
  } catch {
    // Not a valid JWT — try legacy format
  }

  // Try legacy format: session-{userId}-{timestamp}
  const match = token.match(/^session-(.+)-(\d+)$/);
  if (match) {
    const userId = match[1];
    const timestamp = parseInt(match[2], 10);

    if (isNaN(timestamp) || timestamp <= 0) {
      return { valid: false, userId: null, role: null, isLegacy: true };
    }

    const tokenAge = Date.now() - timestamp;
    if (tokenAge > OLD_TOKEN_MAX_AGE) {
      return { valid: false, userId: null, role: null, isLegacy: true };
    }

    // Reject tokens with future timestamps (clock skew tolerance: 5 minutes)
    if (tokenAge < -(5 * 60 * 1000)) {
      return { valid: false, userId: null, role: null, isLegacy: true };
    }

    // Legacy token is valid but we don't have role info
    // Role will be fetched from DB by the auth-guard or route handler
    return {
      valid: true,
      userId,
      role: null, // Will be resolved from DB
      isLegacy: true,
    };
  }

  return { valid: false, userId: null, role: null, isLegacy: false };
}

// ─── Check if JWT_SECRET is properly configured ─────────────────
export function isJwtConfigured(): boolean {
  return JWT_SECRET !== 'finexa-default-secret-change-in-production';
}
