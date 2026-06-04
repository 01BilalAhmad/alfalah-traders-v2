/**
 * Email Sending Utility — Dynamic SMTP from Database
 * 
 * Reads EmailConfig from the database and creates a nodemailer transporter
 * on-the-fly. No hardcoded SMTP settings.
 */

import nodemailer from 'nodemailer';
import { getPool } from '@/lib/pg';

export interface EmailConfigData {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromName: string | null;
  useTLS: boolean;
  isConfigured: boolean;
}

/**
 * Fetch email configuration from database.
 * Returns null if not configured.
 */
export async function getEmailConfig(): Promise<EmailConfigData | null> {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT "smtpHost", "smtpPort", "smtpUser", "smtpPass", "fromName", "useTLS", "isConfigured" FROM "EmailConfig" WHERE "isConfigured" = true ORDER BY "updatedAt" DESC LIMIT 1'
    );
    if (result.rows.length === 0) return null;
    return result.rows[0] as EmailConfigData;
  } catch (error) {
    console.error('Failed to fetch email config:', error);
    return null;
  }
}

/**
 * Create a nodemailer transporter using config from the database.
 */
export async function createTransporter() {
  const config = await getEmailConfig();
  if (!config) {
    throw new Error('Email is not configured. Please set up SMTP in Settings.');
  }

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465, // true for port 465, false for others
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
    tls: config.useTLS ? { rejectUnauthorized: false } : undefined,
  });
}

/**
 * Send an email using the configured SMTP settings.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const config = await getEmailConfig();
  if (!config) {
    throw new Error('Email is not configured.');
  }

  const transporter = await createTransporter();

  const fromAddress = config.fromName
    ? `"${config.fromName}" <${config.smtpUser}>`
    : config.smtpUser;

  const result = await transporter.sendMail({
    from: fromAddress,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''), // strip HTML for text fallback
  });

  return result;
}

/**
 * Check if email is configured (quick check without creating transporter).
 */
export async function isEmailConfigured(): Promise<boolean> {
  try {
    const config = await getEmailConfig();
    return config !== null && config.isConfigured;
  } catch {
    return false;
  }
}
