import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAdmin } from '@/lib/auth-guard';
import { v4 as uuidv4 } from 'uuid';

// Auto-create EmailConfig table if it doesn't exist, and fix missing defaults
async function ensureEmailConfigTable() {
  const pool = getPool();
  // Create table if it doesn't exist (safe no-op if already exists)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "EmailConfig" (
      "id" TEXT PRIMARY KEY,
      "smtpHost" TEXT NOT NULL DEFAULT 'smtp.gmail.com',
      "smtpPort" INTEGER NOT NULL DEFAULT 587,
      "smtpUser" TEXT NOT NULL DEFAULT '',
      "smtpPass" TEXT NOT NULL DEFAULT '',
      "fromName" TEXT,
      "useTLS" BOOLEAN NOT NULL DEFAULT true,
      "isConfigured" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
    );
  `);
  // If table was created by Prisma (no DEFAULT on updatedAt), add the default
  // This is safe — SET DEFAULT is a no-op if default already exists
  try {
    await pool.query(`ALTER TABLE "EmailConfig" ALTER COLUMN "updatedAt" SET DEFAULT NOW()`);
    await pool.query(`ALTER TABLE "EmailConfig" ALTER COLUMN "createdAt" SET DEFAULT NOW()`);
  } catch {
    // Ignore errors — column might not exist or other DB issue
  }
}

// Auto-create PasswordResetToken table if it doesn't exist
async function ensurePasswordResetTokenTable() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
      "id" TEXT PRIMARY KEY,
      "token" TEXT NOT NULL UNIQUE,
      "userId" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "used" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
    );
  `);
}

// Ensure User table has email column
async function ensureUserEmailColumn() {
  const pool = getPool();
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'User' AND column_name = 'email'
      ) THEN
        ALTER TABLE "User" ADD COLUMN "email" TEXT;
      END IF;
    END $$;
  `);
}

// Ensure all required tables exist
async function ensureTables() {
  await ensureEmailConfigTable();
  await ensurePasswordResetTokenTable();
  await ensureUserEmailColumn();
}

// GET /api/admin/email-config — Get current email configuration (admin only)
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    await ensureTables();

    const pool = getPool();
    const result = await pool.query(
      'SELECT id, "smtpHost", "smtpPort", "smtpUser", "fromName", "useTLS", "isConfigured", "createdAt", "updatedAt" FROM "EmailConfig" ORDER BY "updatedAt" DESC LIMIT 1'
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ configured: false, config: null });
    }

    // Return config WITHOUT the password (security)
    const config = result.rows[0];
    return NextResponse.json({
      configured: config.isConfigured,
      config: {
        id: config.id,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        smtpUser: config.smtpUser,
        fromName: config.fromName,
        useTLS: config.useTLS,
        isConfigured: config.isConfigured,
        hasPassword: !!(config.smtpPass && config.smtpPass.length > 0),
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    console.error('Fetch email config error:', error);
    return NextResponse.json({ configured: false, config: null });
  }
}

// POST /api/admin/email-config — Save email configuration (admin only)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    await ensureTables();

    const body = await request.json();
    const { smtpHost, smtpPort, smtpUser, smtpPass, fromName, useTLS } = body;

    if (!smtpHost || !smtpPort || !smtpUser) {
      return NextResponse.json(
        { error: 'SMTP Host, Port, and User are required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Check if config already exists
    const existing = await pool.query('SELECT id, "smtpPass" FROM "EmailConfig" LIMIT 1');

    // Determine password: use new one if provided, otherwise keep existing
    const finalPassword = smtpPass || (existing.rows.length > 0 ? existing.rows[0].smtpPass : '');

    if (!finalPassword) {
      return NextResponse.json(
        { error: 'SMTP App Password is required for new configuration' },
        { status: 400 }
      );
    }

    if (existing.rows.length > 0) {
      // Update existing config
      await pool.query(
        `UPDATE "EmailConfig" SET "smtpHost" = $1, "smtpPort" = $2, "smtpUser" = $3, "smtpPass" = $4, "fromName" = $5, "useTLS" = $6, "isConfigured" = true, "updatedAt" = NOW() WHERE id = $7`,
        [smtpHost, smtpPort, smtpUser, finalPassword, fromName || null, useTLS !== false, existing.rows[0].id]
      );
    } else {
      // Insert new config with generated ID — include updatedAt explicitly
      // (Prisma-created tables have NO DEFAULT on updatedAt, so we must provide it)
      const newId = uuidv4();
      await pool.query(
        `INSERT INTO "EmailConfig" (id, "smtpHost", "smtpPort", "smtpUser", "smtpPass", "fromName", "useTLS", "isConfigured", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())`,
        [newId, smtpHost, smtpPort, smtpUser, finalPassword, fromName || null, useTLS !== false]
      );
    }

    return NextResponse.json({ success: true, message: 'Email configuration saved successfully' });
  } catch (error) {
    console.error('Save email config error:', error);
    return NextResponse.json({ error: `Failed to save email config: ${error instanceof Error ? error.message : 'Unknown error'}` }, { status: 500 });
  }
}

// DELETE /api/admin/email-config — Remove email configuration (admin only)
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    await ensureTables();

    const pool = getPool();
    await pool.query('DELETE FROM "EmailConfig"');
    return NextResponse.json({ success: true, message: 'Email configuration removed' });
  } catch (error) {
    console.error('Delete email config error:', error);
    return NextResponse.json({ error: 'Failed to delete email config' }, { status: 500 });
  }
}
