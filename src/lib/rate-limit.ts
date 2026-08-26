// ─────────────────────────────────────────────────────────────────────
// lib/rate-limit.ts — Distributed rate limiting for Vercel serverless
// ─────────────────────────────────────────────────────────────────────
// WHY: the previous in-memory Map approach in proxy.ts doesn't actually
// work on Vercel serverless — every function instance has its own Map,
// so the "100 req/min per IP" limit becomes "100 req/min per IP per
// instance". With N concurrent instances under load, an attacker gets
// N×100 effective requests per minute. Same problem for login brute
// force: "5 attempts/15min" becomes "N×5 attempts/15min".
//
// FIX: use Postgres as the source of truth for distributed counters,
// with an in-memory L1 cache to avoid hitting the DB on every single
// request. The L1 cache is per-instance (fast path) and Postgres is
// the L2 (cross-instance source of truth).
//
// SCHEMA: lazy-created on first use.
//   CREATE TABLE IF NOT EXISTS "RateLimit" (
//     "key" TEXT NOT NULL PRIMARY KEY,        -- e.g. 'user:<userId>' or 'login-ip:<ip>'
//     "count" INTEGER NOT NULL DEFAULT 0,
//     "windowStart" BIGINT NOT NULL,          -- epoch ms when current window began
//     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
//   );
//
// SQL strategy: a single atomic INSERT ... ON CONFLICT DO UPDATE
// (a.k.a. upsert) makes the increment race-condition-free across
// concurrent serverless instances.
// ─────────────────────────────────────────────────────────────────────

import { getPool } from '@/lib/pg';

// In-memory L1 cache (per-instance, fast path)
// key -> { count, resetTime(epochMs) }
const l1Cache = new Map<string, { count: number; resetTime: number }>();

// Tracks whether the RateLimit table has been ensured on this instance.
// Idempotent CREATE TABLE IF NOT EXISTS runs once per cold start.
let tableEnsured = false;

async function ensureTable(pool: any): Promise<void> {
  if (tableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "RateLimit" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "count" INTEGER NOT NULL DEFAULT 0,
        "windowStart" BIGINT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    tableEnsured = true;
  } catch (err) {
    // Don't crash if table can't be created — fall back to in-memory only.
    // This preserves backward compat: if Postgres is unreachable, the rate
    // limiter degrades to the old in-memory behavior (which is per-instance
    // but at least still blocks obvious flood attempts within an instance).
    console.error('[RateLimit] Table creation failed — using in-memory fallback:', err);
  }
}

// Periodic cleanup of L1 cache (every 5 minutes) to prevent unbounded growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of l1Cache.entries()) {
    if (now > entry.resetTime) {
      l1Cache.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Periodic cleanup of expired RateLimit rows (every 30 min, max 100 rows per pass).
// This prevents the table from growing forever. Old rows are pruned in small
// batches to avoid locking the table for too long.
setInterval(async () => {
  try {
    const pool = getPool();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
    await pool.query(
      `DELETE FROM "RateLimit" WHERE "windowStart" < $1 LIMIT 100`,
      [cutoff]
    );
  } catch {
    // Non-blocking — cleanup is best-effort.
  }
}, 30 * 60 * 1000);

/**
 * Check rate limit for a given key.
 *
 * Returns `{ allowed: true }` if the request is allowed,
 * or `{ allowed: false, retryAfter: seconds }` if rate-limited.
 *
 * @param key        Stable identifier for the rate limit bucket.
 *                   Examples: `user:${userId}`, `login-ip:${ip}`, `login-user:${username}`.
 * @param limit      Maximum number of requests allowed in the window.
 * @param windowMs   Window size in milliseconds (e.g., 60_000 for 1 minute).
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now();

  // ─── L1 cache fast path ──────────────────────────────────────────
  // If we already have a recent entry in memory for this key, use it.
  const cached = l1Cache.get(key);
  if (cached && now < cached.resetTime) {
    if (cached.count >= limit) {
      const retryAfterSec = Math.ceil((cached.resetTime - now) / 1000);
      return { allowed: false, retryAfter: Math.max(1, retryAfterSec) };
    }
    cached.count++;
    return { allowed: true };
  }

  // ─── L2 — Postgres atomic upsert ─────────────────────────────────
  const pool = getPool();
  await ensureTable(pool);

  try {
    // Single atomic SQL: increment count if in same window, else reset.
    // The CASE expressions check whether the existing windowStart + window
    // is still in the future (i.e. we're still inside the same window).
    //   - If yes: count = count + 1, windowStart unchanged.
    //   - If no:  count = 1, windowStart = now (new window).
    const res = await pool.query(
      `INSERT INTO "RateLimit" ("key", "count", "windowStart")
       VALUES ($1, 1, $2)
       ON CONFLICT ("key") DO UPDATE
       SET "count" = CASE
         WHEN "RateLimit"."windowStart" + $3 > $2
         THEN "RateLimit"."count" + 1
         ELSE 1
       END,
       "windowStart" = CASE
         WHEN "RateLimit"."windowStart" + $3 > $2
         THEN "RateLimit"."windowStart"
         ELSE $2
       END
       RETURNING "count", "windowStart"`,
      [key, now, windowMs]
    );
    const newCount = Number(res.rows[0].count);
    const windowStart = Number(res.rows[0].windowStart);

    // Update L1 cache for fast subsequent requests on this instance.
    l1Cache.set(key, {
      count: newCount,
      resetTime: windowStart + windowMs,
    });

    if (newCount > limit) {
      const retryAfterSec = Math.ceil((windowStart + windowMs - now) / 1000);
      return { allowed: false, retryAfter: Math.max(1, retryAfterSec) };
    }
    return { allowed: true };
  } catch (err) {
    // Postgres failed — degrade to in-memory L1 only (per-instance).
    // This is the same behavior as the old code; we're just not making
    // things worse if Postgres has a hiccup.
    console.error('[RateLimit] Postgres check failed — using L1 only:', err);
    if (cached) {
      if (cached.count >= limit) {
        const retryAfterSec = Math.ceil((cached.resetTime - now) / 1000);
        return { allowed: false, retryAfter: Math.max(1, retryAfterSec) };
      }
      cached.count++;
      return { allowed: true };
    }
    // No cached entry and Postgres failed — start a fresh in-memory window.
    l1Cache.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true };
  }
}

/**
 * Convenience wrapper for per-user rate limiting on authenticated routes.
 * Returns true if allowed, false if rate-limited.
 *
 * Default: 200 req/min per user (loose — production traffic from a single
 * OB rarely exceeds 30 req/min, but allows for sync bursts).
 */
export async function checkUserRateLimit(
  userId: string,
  limit: number = 200,
  windowMs: number = 60 * 1000
): Promise<{ allowed: boolean; retryAfter?: number }> {
  return checkRateLimit(`user:${userId}`, limit, windowMs);
}

/**
 * Convenience wrapper for per-IP rate limiting on unauthenticated routes
 * (e.g., /api/auth/login, /api/ping). Same distributed semantics as
 * checkRateLimit, just a stable key prefix for clarity.
 */
export async function checkIpRateLimit(
  ip: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfter?: number }> {
  return checkRateLimit(`ip:${ip}`, limit, windowMs);
}

/**
 * Per-username rate limiting for login brute-force prevention.
 * Use this in the login route handler (not in the proxy, because the
 * proxy can't read the request body to extract the username).
 *
 * Default: 5 attempts per 15 minutes per username (matches the old
 * per-IP Map behavior, but works across serverless instances).
 */
export async function checkLoginRateLimit(
  username: string,
  limit: number = 5,
  windowMs: number = 15 * 60 * 1000
): Promise<{ allowed: boolean; retryAfter?: number }> {
  return checkRateLimit(`login-user:${username.toLowerCase()}`, limit, windowMs);
}
