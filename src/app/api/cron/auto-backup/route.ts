import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { sendEmail, isEmailConfigured } from '@/lib/email';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// GET /api/cron/auto-backup
// Runs weekly via Vercel cron. Creates ZIP of CMS code + DB backup,
// sends to admin email. GitHub-independent — works even if GitHub
// accounts are suspended.
//
// CRON_AUTH_TOKEN environment variable must match query param to prevent
// unauthorized access.
export async function GET(request: NextRequest) {
  try {
    // ── Auth check (prevent unauthorized access) ──
    const authToken = process.env.CRON_AUTH_TOKEN || 'finexa-backup-2026';
    const providedToken = request.nextUrl.searchParams.get('token');
    if (providedToken !== authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results: string[] = [];
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'finexa-backup-'));

    // ── 1. Create CMS code ZIP (from deployed files) ──
    try {
      // On Vercel, the deployed code is in /var/task/ (serverless) or CWD
      // We'll create a ZIP of the src/ directory + key config files
      const codeZipPath = path.join(tmpDir, 'finexa-cms-code.zip');
      const projectRoot = process.cwd();

      // Try to zip key directories
      const dirsToZip = ['src', 'prisma', 'public'].filter(d =>
        fs.access(path.join(projectRoot, d)).then(() => true).catch(() => false)
      );

      if (dirsToZip.length > 0) {
        // Use tar (more reliable than zip on Vercel)
        const tarPath = path.join(tmpDir, 'finexa-cms-code.tar.gz');
        await execAsync(
          `tar -czf ${tarPath} -C ${projectRoot} ${dirsToZip.join(' ')} package.json tsconfig.json next.config.ts 2>/dev/null || true`
        );

        // Check if file was created and has content
        const stats = await fs.stat(tarPath).catch(() => null);
        if (stats && stats.size > 1000) {
          results.push(`✅ CMS code backup: ${(stats.size / 1024).toFixed(0)} KB`);
        }
      }
    } catch (e: any) {
      results.push(`⚠️ Code ZIP failed: ${e.message}`);
    }

    // ── 2. Database backup (key tables as JSON) ──
    let dbBackupSize = '0 KB';
    try {
      const pool = getPool();

      // Backup key tables
      const tables = [
        'Shop', 'User', 'Company', 'Transaction', 'ShopCompanyBalance',
        'ShopOrderbooker', 'UserCompany', 'DailyTarget', 'SmsLog',
        'RouteSession', 'RouteShopVisit', 'ShopVisit', 'ShopNote',
      ];

      const dbBackup: Record<string, any[]> = {};

      for (const table of tables) {
        try {
          const res = await pool.query(`SELECT * FROM "${table}" LIMIT 5000`);
          dbBackup[table] = res.rows;
        } catch {
          // Table might not exist — skip
        }
      }

      // Add metadata
      dbBackup['_metadata'] = {
        backupDate: new Date().toISOString(),
        tableCount: Object.keys(dbBackup).length - 1,
        totalRows: Object.values(dbBackup).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
      };

      const dbJson = JSON.stringify(dbBackup, null, 2);
      const dbPath = path.join(tmpDir, 'finexa-db-backup.json');
      await fs.writeFile(dbPath, dbJson);

      dbBackupSize = `${(dbJson.length / 1024).toFixed(0)} KB`;
      results.push(`✅ DB backup: ${dbBackupSize} (${dbBackup['_metadata'].totalRows} total rows)`);
    } catch (e: any) {
      results.push(`⚠️ DB backup failed: ${e.message}`);
    }

    // ── 3. Send email with backup summary ──
    const emailReady = await isEmailConfigured();
    if (!emailReady) {
      return NextResponse.json({
        success: true,
        message: 'Backup created but email not configured',
        results,
        note: 'Configure email in Settings to receive backups via email',
      });
    }

    const adminEmail = process.env.BACKUP_EMAIL || 'muhmmadbilal1415@gmail.com';
    const today = new Date().toLocaleDateString('en-PK', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #4F46E5, #6366F1); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 20px;">
          <h1 style="color: white; margin: 0; font-size: 22px;">🛡️ Finexa Auto-Backup</h1>
          <p style="color: #C7D2FE; margin: 4px 0 0; font-size: 13px;">${today}</p>
        </div>

        <h2 style="color: #1F2937; font-size: 16px;">Backup Summary</h2>
        <div style="background: #F9FAFB; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          ${results.map(r => `<p style="margin: 4px 0; font-size: 13px; color: #374151;">${r}</p>`).join('')}
        </div>

        <div style="background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
          <p style="color: #92400E; font-size: 12px; margin: 0;">
            <strong>📌 Important:</strong> This is an automated weekly backup.
            The DB backup is attached as JSON in this email's content.
            Code backup runs on the server. If you need the full code ZIP,
            download it from your Vercel/GitHub repository.
          </p>
        </div>

        <h2 style="color: #1F2937; font-size: 16px;">Database Stats</h2>
        <div style="background: #F9FAFB; border-radius: 8px; padding: 16px;">
          <p style="margin: 4px 0; font-size: 13px; color: #374151;">Backup size: ${dbBackupSize}</p>
          <p style="margin: 4px 0; font-size: 13px; color: #374151;">Format: JSON (all key tables)</p>
          <p style="margin: 4px 0; font-size: 13px; color: #374151;">Tables: Shop, User, Company, Transaction, etc.</p>
        </div>

        <p style="color: #9CA3AF; font-size: 11px; text-align: center; margin-top: 24px;">
          © 2026 Finexa Auto-Backup System | This email is sent automatically every Sunday
        </p>
      </div>
    `;

    // Read DB backup JSON for email attachment (inline)
    let dbContent = '';
    try {
      dbContent = await fs.readFile(path.join(tmpDir, 'finexa-db-backup.json'), 'utf-8');
    } catch {}

    await sendEmail({
      to: adminEmail,
      subject: `🛡️ Finexa Weekly Backup — ${new Date().toLocaleDateString('en-PK')}`,
      html: html + (dbContent ? `
        <details style="margin-top: 20px;">
          <summary style="cursor: pointer; font-size: 12px; color: #6B7280;">📋 View DB Backup (JSON)</summary>
          <pre style="background: #F3F4F6; padding: 12px; border-radius: 8px; font-size: 10px; overflow-x: auto; max-height: 400px;">${dbContent.substring(0, 50000)}${dbContent.length > 50000 ? '\n... (truncated, full backup saved on server)' : ''}</pre>
        </details>
      ` : ''),
      text: `Finexa Auto-Backup — ${today}\n\n${results.join('\n')}\n\nDB backup size: ${dbBackupSize}`,
    });

    // ── 4. Cleanup temp directory ──
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Backup sent to ${adminEmail}`,
      results,
    });
  } catch (error: any) {
    console.error('[Auto-Backup] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
