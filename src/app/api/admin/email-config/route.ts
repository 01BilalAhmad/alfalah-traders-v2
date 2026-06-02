import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAdmin } from '@/lib/auth-guard';

// GET /api/admin/email-config — Get current email configuration (admin only)
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
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
        hasPassword: true, // indicate password is saved but don't reveal it
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    console.error('Fetch email config error:', error);
    return NextResponse.json({ error: 'Failed to fetch email config' }, { status: 500 });
  }
}

// POST /api/admin/email-config — Save email configuration (admin only)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { smtpHost, smtpPort, smtpUser, smtpPass, fromName, useTLS } = body;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return NextResponse.json(
        { error: 'SMTP Host, Port, User, and Password are required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Check if config already exists
    const existing = await pool.query('SELECT id FROM "EmailConfig" LIMIT 1');

    if (existing.rows.length > 0) {
      // Update existing config
      await pool.query(
        `UPDATE "EmailConfig" SET "smtpHost" = $1, "smtpPort" = $2, "smtpUser" = $3, "smtpPass" = $4, "fromName" = $5, "useTLS" = $6, "isConfigured" = true, "updatedAt" = NOW() WHERE id = $7`,
        [smtpHost, smtpPort, smtpUser, smtpPass, fromName || null, useTLS !== false, existing.rows[0].id]
      );
    } else {
      // Insert new config
      await pool.query(
        `INSERT INTO "EmailConfig" ("smtpHost", "smtpPort", "smtpUser", "smtpPass", "fromName", "useTLS", "isConfigured") VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [smtpHost, smtpPort, smtpUser, smtpPass, fromName || null, useTLS !== false]
      );
    }

    return NextResponse.json({ success: true, message: 'Email configuration saved successfully' });
  } catch (error) {
    console.error('Save email config error:', error);
    return NextResponse.json({ error: 'Failed to save email config' }, { status: 500 });
  }
}

// DELETE /api/admin/email-config — Remove email configuration (admin only)
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const pool = getPool();
    await pool.query('DELETE FROM "EmailConfig"');
    return NextResponse.json({ success: true, message: 'Email configuration removed' });
  } catch (error) {
    console.error('Delete email config error:', error);
    return NextResponse.json({ error: 'Failed to delete email config' }, { status: 500 });
  }
}
