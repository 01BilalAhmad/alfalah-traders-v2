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
// SECURITY: Fail-fast — if JWT_SECRET is not set, the app CANNOT start.
// Previously this had a hardcoded fallback ('finexa-default-secret-change-in-production')
// which meant a forgotten env var in production silently made all tokens forgeable.
// Now: throws synchronously when the module is first imported, surfacing the
// misconfiguration immediately on boot instead of leaving a forgeable secret in place.
const RAW_JWT_SECRET = process.env.JWT_SECRET;

if (!RAW_JWT_SECRET || RAW_JWT_SECRET.length < 32) {
  // Throw with a clear, actionable message. The error fires on first import,
  // which means the very first request that touches this module will 500 —
  // forcing the operator to fix the env var before going live.
  throw new Error(
    '[security] JWT_SECRET environment variable is required and must be at least 32 characters long. ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))" ' +
    'and set it in your Vercel project settings / .env file.'
  );
}

const JWT_SECRET = RAW_JWT_SECRET as string;
const JWT_EXPIRES_IN = '7d'; // 7 days — matches old token age
const OLD_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

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
// After the fail-fast check above, JWT_SECRET is ALWAYS set when this code runs.
// Kept for backward compat with callers that still poll it (e.g., /api/setup).
export function isJwtConfigured(): boolean {
  return true;
}
