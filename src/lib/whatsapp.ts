/**
 * WhatsApp API Service — WasenderAPI integration
 *
 * Sends WhatsApp messages (text + image) to shopkeepers via WasenderAPI.
 * Requires API key + session connection from WasenderAPI dashboard.
 *
 * API docs: https://wasenderapi.com/api-docs
 * Base URL: https://wasenderapi.com/api
 * Auth: Bearer token
 */

import { getPool } from '@/lib/pg';

const WASENDER_BASE = 'https://wasenderapi.com/api';

// ─── Config helpers ─────────────────────────────────────────────
async function getConfig(key: string): Promise<string | null> {
  try {
    const pool = getPool();
    const res = await pool.query(
      `SELECT value FROM "SystemConfig" WHERE key = $1 LIMIT 1`,
      [key]
    );
    return res.rows.length > 0 ? res.rows[0].value : null;
  } catch {
    return null;
  }
}

async function setConfig(key: string, value: string): Promise<void> {
  try {
    const pool = getPool();
    const existing = await pool.query(
      `SELECT id FROM "SystemConfig" WHERE key = $1`,
      [key]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE "SystemConfig" SET value = $1, "updatedAt" = NOW() WHERE key = $2`,
        [value, key]
      );
    } else {
      await pool.query(
        `INSERT INTO "SystemConfig" (id, key, value, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, NOW(), NOW())`,
        [`config-${key}`, key, value]
      );
    }
  } catch (err) {
    console.error('[WhatsApp] setConfig error:', err);
  }
}

// ─── Phone number conversion ────────────────────────────────────
export function convertToWhatsAppPhone(phone: string): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  // Remove leading + if present
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  // Pakistani numbers: 03XX → 923XX
  if (cleaned.startsWith('0')) {
    cleaned = '92' + cleaned.slice(1);
  }
  // If doesn't start with 92, add it
  if (!cleaned.startsWith('92') && cleaned.length === 10) {
    cleaned = '92' + cleaned;
  }
  // Validate: should be 12 digits (92 + 10)
  if (!/^\d{12}$/.test(cleaned)) return null;
  return cleaned;
}

// ─── Get API key ────────────────────────────────────────────────
async function getApiKey(): Promise<string | null> {
  return getConfig('whatsapp_api_key');
}

// ─── Check if a phone is on WhatsApp ────────────────────────────
export async function checkOnWhatsApp(phone: string): Promise<boolean> {
  const apiKey = await getApiKey();
  if (!apiKey) return false;
  const waPhone = convertToWhatsAppPhone(phone);
  if (!waPhone) return false;

  try {
    const res = await fetch(`${WASENDER_BASE}/on-whatsapp/${waPhone}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const data = await res.json();
      return data.exists === true || data.onWhatsApp === true;
    }
  } catch { /* silent */ }
  return false;
}

// ─── Send text message ──────────────────────────────────────────
export async function sendTextMessage(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = await getApiKey();
  if (!apiKey) return { success: false, error: 'WhatsApp API key not configured' };

  const waPhone = convertToWhatsAppPhone(to);
  if (!waPhone) return { success: false, error: `Invalid phone number: ${to}` };

  try {
    const res = await fetch(`${WASENDER_BASE}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: waPhone,
        text: message,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      return { success: true, messageId: data?.key?.id || data?.messageId };
    }
    return { success: false, error: data?.message || data?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

// ─── Send image message (with caption) ──────────────────────────
export async function sendImageMessage(
  to: string,
  imageUrl: string,
  caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = await getApiKey();
  if (!apiKey) return { success: false, error: 'WhatsApp API key not configured' };

  const waPhone = convertToWhatsAppPhone(to);
  if (!waPhone) return { success: false, error: `Invalid phone number: ${to}` };

  try {
    const res = await fetch(`${WASENDER_BASE}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: waPhone,
        type: 'image',
        image: { url: imageUrl },
        caption: caption || '',
      }),
    });

    const data = await res.json();
    if (res.ok) {
      return { success: true, messageId: data?.key?.id || data?.messageId };
    }
    return { success: false, error: data?.message || data?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

// ─── Send document (PDF) ────────────────────────────────────────
export async function sendDocumentMessage(
  to: string,
  documentUrl: string,
  fileName: string,
  caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = await getApiKey();
  if (!apiKey) return { success: false, error: 'WhatsApp API key not configured' };

  const waPhone = convertToWhatsAppPhone(to);
  if (!waPhone) return { success: false, error: `Invalid phone number: ${to}` };

  try {
    const res = await fetch(`${WASENDER_BASE}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: waPhone,
        type: 'document',
        document: { url: documentUrl, filename: fileName },
        caption: caption || '',
      }),
    });

    const data = await res.json();
    if (res.ok) {
      return { success: true, messageId: data?.key?.id || data?.messageId };
    }
    return { success: false, error: data?.message || data?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

// ─── Toggle check ───────────────────────────────────────────────
export async function isSmsEnabled(type: 'recovery' | 'overdue' | 'credit'): Promise<boolean> {
  const key = `whatsapp_${type}_sms`;
  const value = await getConfig(key);
  return value === 'true';
}

// ─── Settings helpers ───────────────────────────────────────────
export async function getWhatsAppSettings(): Promise<Record<string, string>> {
  const keys = [
    'whatsapp_api_key',
    'whatsapp_session_id',
    'whatsapp_recovery_sms',
    'whatsapp_overdue_sms',
    'whatsapp_credit_sms',
    'whatsapp_business_name',
  ];
  const result: Record<string, string> = {};
  for (const key of keys) {
    result[key] = (await getConfig(key)) || '';
  }
  // Defaults
  if (!result['whatsapp_recovery_sms']) result['whatsapp_recovery_sms'] = 'false';
  if (!result['whatsapp_overdue_sms']) result['whatsapp_overdue_sms'] = 'false';
  if (!result['whatsapp_credit_sms']) result['whatsapp_credit_sms'] = 'false';
  if (!result['whatsapp_business_name']) result['whatsapp_business_name'] = 'AL-FALAH TRADERS';
  return result;
}

export async function updateWhatsAppSettings(settings: Record<string, string>): Promise<void> {
  const allowed = [
    'whatsapp_api_key',
    'whatsapp_session_id',
    'whatsapp_recovery_sms',
    'whatsapp_overdue_sms',
    'whatsapp_credit_sms',
    'whatsapp_business_name',
  ];
  for (const key of allowed) {
    if (settings[key] !== undefined) {
      await setConfig(key, String(settings[key]));
    }
  }
}

// ─── Log SMS ────────────────────────────────────────────────────
export async function logSms(
  shopId: string,
  shopName: string,
  shopPhone: string | null,
  orderbookerId: string | null,
  transactionId: string | null,
  method: 'whatsapp',
  status: 'sent' | 'failed',
  message: string,
  errorMessage?: string
): Promise<void> {
  try {
    const pool = getPool();
    const crypto = await import('crypto');
    const id = `sms_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO "SmsLog" (id, "shopId", "shopName", "shopPhone", "orderbookerId",
        "transactionId", method, status, message, "errorMessage", "sentAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [id, shopId, shopName, shopPhone, orderbookerId, transactionId,
       method, status, message.slice(0, 500), errorMessage?.slice(0, 500) || null]
    );
  } catch (err) {
    console.error('[WhatsApp] logSms error:', err);
  }
}

// ─── Send recovery SMS ──────────────────────────────────────────
export async function sendRecoverySms(opts: {
  shopId: string;
  shopName: string;
  shopPhone: string | null;
  orderbookerId: string | null;
  transactionId: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  orderbookerName?: string;
  imageUrl?: string; // optional receipt image URL
}): Promise<{ success: boolean; error?: string }> {
  const enabled = await isSmsEnabled('recovery');
  if (!enabled) return { success: false, error: 'Recovery SMS is disabled' };

  if (!opts.shopPhone) {
    return { success: false, error: 'Shop has no phone number' };
  }

  const businessName = await getConfig('whatsapp_business_name') || 'AL-FALAH TRADERS';
  const msg = `✅ Recovery Receipt\n\n🏪 Shop: ${opts.shopName}\n💰 Amount: Rs ${opts.amount.toLocaleString('en-PK')}\n📋 Previous Balance: Rs ${opts.previousBalance.toLocaleString('en-PK')}\n✅ New Balance: Rs ${opts.newBalance.toLocaleString('en-PK')}\n👤 OB: ${opts.orderbookerName || '—'}\n\nThank you! 🙏\n— ${businessName}`;

  let result;
  if (opts.imageUrl) {
    // Send image + caption
    result = await sendImageMessage(opts.shopPhone, opts.imageUrl, msg);
  } else {
    // Send text only
    result = await sendTextMessage(opts.shopPhone, msg);
  }

  // Log
  await logSms(
    opts.shopId, opts.shopName, opts.shopPhone, opts.orderbookerId,
    opts.transactionId, 'whatsapp',
    result.success ? 'sent' : 'failed',
    msg,
    result.success ? undefined : result.error
  );

  return result;
}

// ─── Send overdue reminder SMS ──────────────────────────────────
export async function sendOverdueSms(opts: {
  shopId: string;
  shopName: string;
  shopPhone: string | null;
  balance: number;
  daysOverdue: number;
}): Promise<{ success: boolean; error?: string }> {
  if (!opts.shopPhone) return { success: false, error: 'No phone' };

  const businessName = await getConfig('whatsapp_business_name') || 'AL-FALAH TRADERS';
  const businessPhone = await getConfig('whatsapp_business_phone') || '';
  const msg = `⚠️ Payment Reminder\n\n🏪 ${opts.shopName}\n💰 Outstanding: Rs ${opts.balance.toLocaleString('en-PK')}\n📅 Overdue: ${opts.daysOverdue} days\n\nPlease make payment at your earliest convenience.\nContact: ${businessPhone}\n— ${businessName}`;

  const result = await sendTextMessage(opts.shopPhone, msg);

  await logSms(
    opts.shopId, opts.shopName, opts.shopPhone, null, null,
    'whatsapp', result.success ? 'sent' : 'failed',
    msg, result.success ? undefined : result.error
  );

  return result;
}

// ─── Send credit SMS ────────────────────────────────────────────
export async function sendCreditSms(opts: {
  shopId: string;
  shopName: string;
  shopPhone: string | null;
  orderbookerId: string | null;
  transactionId: string;
  amount: number;
  newBalance: number;
  companyName?: string;
}): Promise<{ success: boolean; error?: string }> {
  const enabled = await isSmsEnabled('credit');
  if (!enabled) return { success: false, error: 'Credit SMS is disabled' };

  if (!opts.shopPhone) return { success: false, error: 'No phone' };

  const businessName = await getConfig('whatsapp_business_name') || 'AL-FALAH TRADERS';
  const msg = `📦 Credit Posted\n\n🏪 Shop: ${opts.shopName}\n💰 Amount: Rs ${opts.amount.toLocaleString('en-PK')}\n✅ New Balance: Rs ${opts.newBalance.toLocaleString('en-PK')}\n${opts.companyName ? `🏢 Company: ${opts.companyName}\n` : ''}\n— ${businessName}`;

  const result = await sendTextMessage(opts.shopPhone, msg);

  await logSms(
    opts.shopId, opts.shopName, opts.shopPhone, opts.orderbookerId,
    opts.transactionId, 'whatsapp',
    result.success ? 'sent' : 'failed',
    msg, result.success ? undefined : result.error
  );

  return result;
}
