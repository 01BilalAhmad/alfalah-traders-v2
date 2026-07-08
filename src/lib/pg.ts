/**
 * Database Connection Adapter for Finexa
 *
 * This module automatically detects whether to use PostgreSQL or SQLite:
 * - If DATABASE_URL is a PostgreSQL connection string (starts with postgres:// or postgresql://),
 *   it uses the real `pg` library (for Vercel/Neon production)
 * - If DATABASE_URL is a SQLite file path (starts with file:),
 *   it uses a Prisma-based SQLite adapter (for local dev without PostgreSQL)
 *
 * Both modes provide the same interface: getPool(), query(), getClient(), toPgArray()
 */

import type { QueryResult as PgQueryResult } from 'pg';

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  command?: string;
}

// ─── Detect Database Type ────────────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL || '';
const isPostgres = dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://');
const isSqlite = dbUrl.startsWith('file:');

// ─── PostgreSQL Implementation (Production) ──────────────────────────────────

async function createPgPool() {
  const pg = await import('pg');

  // Register type parsers for Neon PostgreSQL
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
        if (ch === '"' && !inQuotes) { inQuotes = true; }
        else if (ch === '"' && inQuotes) { inQuotes = false; }
        else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
        else { current += ch; }
      }
      if (current || result.length > 0) result.push(current);
      return result;
    }
    return [val];
  });

  pg.types.setTypeParser(pg.types.builtins.FLOAT8, (val: string) => val === null ? null : parseFloat(val));
  pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => val === null ? null : parseFloat(val));

  const globalForPool = globalThis as unknown as { pgPool: pg.Pool | undefined };

  if (!globalForPool.pgPool) {
    const connectionString = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
    const isPooled = connectionString?.includes('-pooler');

    globalForPool.pgPool = new pg.Pool({
      connectionString,
      ssl: connectionString?.startsWith('file:') ? false : { rejectUnauthorized: false },
      max: isPooled ? 5 : 3,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
      maxLifetimeSeconds: 300,
    });

    globalForPool.pgPool.on('error', (err) => {
      console.error('[PG Pool] Unexpected error on idle client:', err.message);
    });
  }

  return globalForPool.pgPool;
}

// ─── SQLite Implementation (Local Dev) ───────────────────────────────────────

function convertSql(sql: string): string {
  let converted = sql;
  converted = converted.replace(/\$(\d+)/g, '?');
  converted = converted.replace(/\bNOW\(\)/gi, "datetime('now')");
  converted = converted.replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')");
  converted = converted.replace(/\s+RETURNING\s+\*/gi, '');
  converted = converted.replace(/\s+RETURNING\s+"[^"]*"(?:\s*,\s*"[^"]*")*/gi, '');
  converted = converted.replace(/\s+RETURNING\s+\w+(?:\s*,\s*\w+)*/gi, '');
  converted = converted.replace(/\bILIKE\b/gi, 'LIKE');
  converted = converted.replace(/::text\[\]/gi, '');
  converted = converted.replace(/::text/gi, '');
  converted = converted.replace(/::numeric/gi, '');
  converted = converted.replace(/::double precision/gi, '');
  converted = converted.replace(/array_to_json\(([^)]+)\)/gi, '$1');
  converted = converted.replace(/json_build_array\(([^)]+)\)/gi, 'json_array($1)');
  converted = converted.replace(/\bDOUBLE PRECISION\b/gi, 'REAL');
  converted = converted.replace(/\bTIMESTAMP\(3\)/gi, 'TEXT');
  converted = converted.replace(/\bBOOLEAN\b/gi, 'INTEGER');
  converted = converted.replace(/\bTEXT\[\]/gi, 'TEXT');
  converted = converted.replace(/\bBIGSERIAL\b/gi, 'INTEGER');
  return converted;
}

function parseJsonFields(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  // PostgreSQL returns native arrays, so no JSON parsing needed for routeDays.
  // This function is kept as a no-op for SQLite compatibility (SQLite adapter
  // uses Prisma which also handles arrays natively with the current schema).
  return rows;
}

async function createSqlitePool() {
  const { db } = await import('@/lib/db');

  interface SqlitePoolClient {
    query: (text: string, params?: unknown[]) => Promise<QueryResult>;
    release: () => void;
  }

  interface SqlitePool {
    query: (text: string, params?: unknown[]) => Promise<QueryResult>;
    connect: () => Promise<SqlitePoolClient>;
    on: (event: string, callback: (err: Error) => void) => void;
  }

  async function executeQuery(text: string, params?: unknown[]): Promise<QueryResult> {
    const convertedSql = convertSql(text);
    try {
      if (text.includes('information_schema')) {
        return handleInformationSchemaQuery(text);
      }

      const normalizedSql = convertedSql.trim().toUpperCase();

      if (normalizedSql.startsWith('SELECT') || normalizedSql.startsWith('PRAGMA')) {
        const result = params?.length ? await db.$queryRawUnsafe(convertedSql, ...params) : await db.$queryRawUnsafe(convertedSql);
        const rows = Array.isArray(result) ? result : [result];
        return { rows: parseJsonFields(rows as Record<string, unknown>[]), rowCount: rows.length, command: 'SELECT' };
      } else {
        const count = params?.length ? await db.$executeRawUnsafe(convertedSql, ...params) : await db.$executeRawUnsafe(convertedSql);
        if (text.toUpperCase().includes('RETURNING')) {
          const tableMatch = text.match(/(?:INSERT\s+INTO|UPDATE)\s+"?(\w+)"?/i);
          if (tableMatch) {
            try {
              const lastRows = await db.$queryRawUnsafe(`SELECT * FROM "${tableMatch[1]}" ORDER BY rowid DESC LIMIT 1`);
              if (Array.isArray(lastRows) && lastRows.length > 0) {
                return { rows: lastRows as Record<string, unknown>[], rowCount: count, command: 'INSERT' };
              }
            } catch { /* ignore */ }
          }
        }
        return { rows: [], rowCount: count, command: normalizedSql.startsWith('INSERT') ? 'INSERT' : normalizedSql.startsWith('UPDATE') ? 'UPDATE' : 'DELETE' };
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('already exists') || errMsg.includes('duplicate column') || errMsg.includes('no such table')) {
        return { rows: [], rowCount: 0 };
      }
      console.error('[SQLite Adapter] Query error:', errMsg);
      console.error('[SQLite Adapter] Original SQL:', text.substring(0, 200));
      console.error('[SQLite Adapter] Converted SQL:', convertedSql.substring(0, 200));
      throw error;
    }
  }

  function handleInformationSchemaQuery(text: string): QueryResult {
    const tableMatch = text.match(/table_name\s*=\s*'(\w+)'/i);
    const columnMatch = text.match(/column_name\s*=\s*'(\w+)'/i);
    if (tableMatch && columnMatch) {
      return { rows: [{ column_name: columnMatch[1] }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  const pool: SqlitePool = {
    query: executeQuery,
    connect: async () => ({
      query: async (text: string, params?: unknown[]) => {
        const normalizedSql = text.trim().toUpperCase();
        if (normalizedSql === 'BEGIN' || normalizedSql === 'COMMIT' || normalizedSql === 'ROLLBACK') {
          return { rows: [], rowCount: 0 };
        }
        return executeQuery(text, params);
      },
      release: () => {},
    }),
    on: () => {},
  };

  return pool;
}

// ─── Unified Exports ─────────────────────────────────────────────────────────

type Pool = Awaited<ReturnType<typeof createPgPool>> | Awaited<ReturnType<typeof createSqlitePool>>;

const globalForDb = globalThis as unknown as {
  dbPool: Pool | undefined;
  dbType: 'postgres' | 'sqlite' | undefined;
};

async function getPoolInternal(): Promise<Pool> {
  if (globalForDb.dbPool) return globalForDb.dbPool;

  if (isPostgres) {
    console.log('[DB] Using PostgreSQL (production mode)');
    globalForDb.dbPool = await createPgPool();
    globalForDb.dbType = 'postgres';
  } else if (isSqlite) {
    console.log('[DB] Using SQLite adapter (local dev mode)');
    globalForDb.dbPool = await createSqlitePool();
    globalForDb.dbType = 'sqlite';
  } else {
    throw new Error(`[DB] Unsupported DATABASE_URL format: ${dbUrl.substring(0, 30)}...`);
  }

  return globalForDb.dbPool;
}

/**
 * Get the shared connection pool.
 * Automatically uses PostgreSQL or SQLite based on DATABASE_URL.
 */
export function getPool() {
  // For PostgreSQL, return the pool directly (synchronous)
  if (isPostgres) {
    // Synchronous path for pg - we import synchronously
    const pg = require('pg');

    // Register type parsers
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
          if (ch === '"' && !inQuotes) { inQuotes = true; }
          else if (ch === '"' && inQuotes) { inQuotes = false; }
          else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
          else { current += ch; }
        }
        if (current || result.length > 0) result.push(current);
        return result;
      }
      return [val];
    });
    pg.types.setTypeParser(pg.types.builtins.FLOAT8, (val: string) => val === null ? null : parseFloat(val));
    pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => val === null ? null : parseFloat(val));

    const globalForPool = globalThis as unknown as { pgPool: InstanceType<typeof pg.Pool> | undefined };

    if (!globalForPool.pgPool) {
      const connectionString = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
      const isPooled = connectionString?.includes('-pooler');

      globalForPool.pgPool = new pg.Pool({
        connectionString,
        ssl: connectionString?.startsWith('file:') ? false : { rejectUnauthorized: false },
        max: isPooled ? 5 : 3,
        idleTimeoutMillis: 20000,
        connectionTimeoutMillis: 10000,
        maxLifetimeSeconds: 300,
      });

      globalForPool.pgPool.on('error', (err: Error) => {
        console.error('[PG Pool] Unexpected error on idle client:', err.message);
      });
    }

    return globalForPool.pgPool;
  }

  // For SQLite, we need async init
  if (isSqlite) {
    // Return a proxy that lazily initializes the SQLite pool
    const globalForSqlite = globalThis as unknown as { sqlitePool: any };

    if (!globalForSqlite.sqlitePool) {
      // We'll create a lazy pool that initializes on first query
      let poolPromise: Promise<any> | null = null;

      globalForSqlite.sqlitePool = {
        query: async (text: string, params?: unknown[]) => {
          const p = await createSqlitePool();
          return p.query(text, params);
        },
        connect: async () => {
          const p = await createSqlitePool();
          return p.connect();
        },
        on: () => {},
      };
    }

    return globalForSqlite.sqlitePool;
  }

  throw new Error(`[DB] Unsupported DATABASE_URL format: ${dbUrl.substring(0, 30)}...`);
}

/**
 * Execute a single query using the shared pool.
 */
export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
  const pool = getPool();
  if (isPostgres) {
    const result = await (pool as any).query(text, params);
    return {
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rowCount ?? 0,
      command: result.command,
    };
  }
  return pool.query(text, params);
}

/**
 * Get a dedicated client from the pool for transactions.
 */
export async function getClient() {
  return getPool().connect();
}

/**
 * Convert a JavaScript string[] to a PostgreSQL text[] literal string.
 * For PostgreSQL: returns '{item1","item2"}' format (native array literal)
 * For SQLite: returns the array directly (Prisma handles it)
 */
export function toPgArray(arr: string[]): string | string[] {
  if (!arr || arr.length === 0) return isPostgres ? '{}' : [];
  if (isPostgres) {
    return `{${arr.map(item => `"${item.replace(/"/g, '\\"')}"`).join(',')}}`;
  }
  return arr;
}
