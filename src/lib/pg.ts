/**
 * Shared PostgreSQL Client Factory for Al-Falah Traders
 *
 * All API routes should use getPgClient() instead of creating their own pg.Client.
 * This ensures consistent SSL configuration for Neon PostgreSQL.
 */
import pg from 'pg';

const { Client } = pg;

// Register type parsers for Neon PostgreSQL
// By default, pg returns TEXT[] as a string like "{monday,thursday}"
// This parser converts it to a proper JS array
pg.types.setTypeParser(pg.types.builtins.TEXT_ARRAY, (val: string) => {
  if (!val) return [];
  // PostgreSQL array format: {elem1,elem2} or {"elem with spaces","another"}
  if (val.startsWith('{') && val.endsWith('}')) {
    const inner = val.slice(1, -1);
    if (inner === '') return [];
    // Handle quoted elements
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

// Also parse FLOAT8 (double precision) to avoid string returns
pg.types.setTypeParser(pg.types.builtins.FLOAT8, (val: string) => {
  return val === null ? null : parseFloat(val);
});

// Parse NUMERIC type
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => {
  return val === null ? null : parseFloat(val);
});

/**
 * Create a new pg Client with proper SSL configuration for Neon.
 * Usage:
 *   import { getPgClient } from '@/lib/pg';
 *   const client = getPgClient();
 *   await client.connect();
 */
export function getPgClient(): pg.Client {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? true : true, // Always SSL for Neon
  });
}
