import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { sendEmail, isEmailConfigured } from '@/lib/email';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// POST /api/auth/forgot-password — Request password reset (PUBLIC — no auth required)
// Only works for admin users. Generates a token and sends reset link via email.
export async function POST(request: Request) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    console.log('[forgot-password] Request for username:', username.trim().toLowerCase());

    // Check if email is configured
    const emailReady = await isEmailConfigured();
    if (!emailReady) {
      console.log('[forgot-password] Email NOT configured — rejecting request');
      return NextResponse.json(
        { error: 'Password recovery is not available. Email is not configured on the server. Please contact your administrator.' },
        { status: 503 }
      );
    }

    const pool = getPool();

    // Ensure PasswordResetToken table exists
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

    // Ensure User table has email column
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'email') THEN
          ALTER TABLE "User" ADD COLUMN "email" TEXT;
        END IF;
      END $$;
    `);

    // Find admin user with this username
    const userResult = await pool.query(
      'SELECT id, username, name, role, email FROM "User" WHERE LOWER(username) = $1',
      [username.trim().toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      console.log('[forgot-password] Username not found:', username.trim().toLowerCase());
      // SECURITY: Return same generic message to prevent username enumeration
      return NextResponse.json({
        success: true,
        message: 'If this username belongs to an admin with a registered email, a reset link will be sent.',
      });
    }

    const user = userResult.rows[0];

    // Only allow admin password reset via email
    if (user.role !== 'admin') {
      console.log('[forgot-password] User is not admin:', user.username, 'role:', user.role);
      // SECURITY: Return same generic message — don't reveal user's role
      return NextResponse.json({
        success: true,
        message: 'If this username belongs to an admin with a registered email, a reset link will be sent.',
      });
    }

    // Check if admin has email registered
    if (!user.email) {
      console.log('[forgot-password] Admin has no email registered:', user.username);
      return NextResponse.json(
        { error: 'No email address is registered for this admin account. Please log in and add your email in Settings → Email Configuration first.' },
        { status: 400 }
      );
    }

    console.log('[forgot-password] Sending reset email to:', user.email);

    // Generate secure reset token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    // Invalidate any existing tokens for this user
    await pool.query(
      'UPDATE "PasswordResetToken" SET used = true WHERE "userId" = $1 AND used = false',
      [user.id]
    );

    // Save new token — include id explicitly (Prisma-created tables have no DEFAULT for id)
    const tokenId = uuidv4();
    await pool.query(
      'INSERT INTO "PasswordResetToken" (id, token, "userId", email, "expiresAt", used, "createdAt") VALUES ($1, $2, $3, $4, $5, false, NOW())',
      [tokenId, token, user.id, user.email, expiresAt]
    );

    // SECURITY: Use server-configured BASE_URL instead of request headers
    // Prevents host header injection / phishing via malicious Origin header
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://alfalah-traders.vercel.app';
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    // Send reset email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Finexa — Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <div style="background: linear-gradient(135deg, #1e3a5f, #2563eb); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 20px;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Finexa</h1>
              <p style="color: #93c5fd; margin: 4px 0 0; font-size: 14px;">Password Reset Request</p>
            </div>
            
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">
              Hello <strong>${user.name}</strong>,
            </p>
            
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">
              We received a request to reset your Finexa account password. Click the button below to set a new password:
            </p>
            
            <div style="text-align: center; margin: 24px 0;">
              <a href="${resetUrl}" style="background: linear-gradient(135deg, #1e3a5f, #2563eb); color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 12px; line-height: 1.6;">
              Or copy this link to your browser:<br>
              <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
            </p>
            
            <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; margin-top: 20px;">
              <p style="color: #92400e; font-size: 12px; margin: 0;">
                <strong>⚠ This link expires in 15 minutes.</strong> If you did not request a password reset, you can safely ignore this email.
              </p>
            </div>
            
            <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 20px;">
              © 2026 Finexa. All rights reserved.
            </p>
          </div>
        `,
        text: `Finexa Password Reset\n\nHello ${user.name},\n\nWe received a request to reset your password.\n\nReset Link: ${resetUrl}\n\nThis link expires in 15 minutes.\nIf you did not request this, you can safely ignore this email.`,
      });
      console.log('[forgot-password] Email sent successfully to:', user.email);
    } catch (emailError) {
      console.error('[forgot-password] Failed to send email:', emailError);
      return NextResponse.json(
        // SECURITY: Don't expose internal SMTP error details to client
        { error: 'Failed to send reset email. Please check your email configuration or contact your administrator.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `A password reset link has been sent to ${user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')}. Please check your inbox and spam folder.`,
    });
  } catch (error) {
    console.error('[forgot-password] Unexpected error:', error);
    return NextResponse.json({ error: 'An error occurred. Please try again later.' }, { status: 500 });
  }
}
