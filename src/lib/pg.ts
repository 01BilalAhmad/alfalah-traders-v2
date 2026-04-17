/**
 * Shared PostgreSQL Client Factory for Al-Falah Traders
 *
 * All API routes should use getPgClient() instead of creating their own pg.Client.
 * This ensures consistent SSL configuration for Neon PostgreSQL.
 */
import pg from 'pg';

const { Client } = pg;

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
