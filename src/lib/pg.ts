/**
 * Shared PostgreSQL Connection Pool for Finexa
 *
 * MIGRATED from per-request Client to a shared Pool.
 * This eliminates the slow connect/disconnect cycle on every API call,
 * which is the #1 cause of slow loading with Neon PostgreSQL on Vercel.
 *
 * Usage:
 *   import { getPool, query } from '@/lib/pg';
 *
 *   // Simple queries (most common):
 *   const result = await query('SELECT ...');
 *   const result = await query('SELECT * FROM "Shop" WHERE id = $1', [shopId]);
 *
 *   // Multiple queries in one request:
 *   const pool = getPool();
 *   const [r1, r2] = await Promise.all([
 *     pool.query('SELECT ...'),
 *     pool.query('SELECT ...'),
 *   ]);
 *
 *   // Transactions:
 *   const client = await getPool().connect();
 *   try {
 *     await client.query('BEGIN');
 *     await client.query('...');
 *     await client.query('COMMIT');
 *   } catch {
 *     await client.query('ROLLBACK');
 *   } finally {
 *     client.release(); // IMPORTANT: release, not end!
 *   }
 */
import pg from 'pg';

// Register type parsers for Neon PostgreSQL (once, at module load)
pg.types.setTypeParser(pg.types.builtins.TEXT_ARRAY, (val: string) => {
  if (!val) return [];
  if (val.startsWith('{') && val.endsWith('}')) {
    const inner = val.slice(1, -1);
    if (inner === '') return [];
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === '"' && !inQuotes) {
        inQuotes = true;
      } else if (ch === '"' && inQuotes) {
        inQuotes = false;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current || result.length > 0) {
      result.push(current);
    }
    return result;
  }
  return [val];
});

pg.types.setTypeParser(pg.types.builtins.FLOAT8, (val: string) => {
  return val === null ? null : parseFloat(val);
});

pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => {
  return val === null ? null : parseFloat(val);
});

/**
 * Convert a JavaScript string[] to a PostgreSQL text[] literal string.
 */
export function toPgArray(arr: string[]): string {
  if (!arr || arr.length === 0) return '{}';
  return `{${arr.map(item => `"${item.replace(/"/g, '\\"')}"`).join(',')}}`;
}

// ─── Connection Pool Singleton ────────────────────────────────────────────────

const globalForPool = globalThis as unknown as {
  pgPool: pg.Pool | undefined;
};

function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;

  // Check if using Neon pooled connection
  const isPooled = connectionString?.includes('-pooler');

  return new pg.Pool({
    connectionString,
    ssl: connectionString?.startsWith('file:') ? false : {
      rejectUnauthorized: false,
    },
    // Pool size: Neon free tier allows max 5 concurrent connections
    max: isPooled ? 5 : 3,
    // Idle timeout: close connections after 20 seconds
    idleTimeoutMillis: 20000,
    // Connection timeout: 10 seconds (Neon cold start can take 3-5s)
    connectionTimeoutMillis: 10000,
    // Max lifetime: recycle connections every 5 minutes
    maxLifetimeSeconds: 300,
  });
}

/**
 * Get the shared connection pool.
 * Reused across requests within the same serverless function instance.
 */
export function getPool(): pg.Pool {
  if (!globalForPool.pgPool) {
    globalForPool.pgPool = createPool();
    globalForPool.pgPool.on('error', (err) => {
      console.error('[PG Pool] Unexpected error on idle client:', err.message);
    });
  }
  return globalForPool.pgPool;
}

/**
 * Execute a single query using the shared pool.
 * This is the simplest way to run queries — no connect/end needed.
 *
 * @example
 *   const result = await query('SELECT * FROM "Shop" WHERE id = $1', [shopId]);
 *   const shops = result.rows;
 */
export async function query(text: string, params?: unknown[]): Promise<pg.QueryResult> {
  return getPool().query(text, params);
}

/**
 * Get a dedicated client from the pool for transactions.
 * IMPORTANT: You MUST call client.release() when done (NOT client.end()).
 *
 * @example
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     await client.query('INSERT INTO ...');
 *     await client.query('COMMIT');
 *   } catch {
 *     await client.query('ROLLBACK');
 *   } finally {
 *     client.release();
 *   }
 */
export async function getClient(): Promise<pg.PoolClient> {
  return getPool().connect();
}
