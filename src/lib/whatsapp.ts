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

// ─── Translate raw WasenderAPI errors to user-friendly Urdu/English ───
export function translateWaError(rawError: string): string {
  if (!rawError) return 'Unknown error';
  const e = rawError.toLowerCase();

  // JID doesn't exist → number not on WhatsApp
  if (e.includes('jid does not exist') || e.includes('not on whatsapp') || e.includes('not exists')) {
    return 'Is number par WhatsApp nahi hai. Shop keeper ke WhatsApp wala number update karein.';
  }
  // Rate limit / free trial
  if (e.includes('free trial') || e.includes('rate limit') || e.includes('every 1 minute')) {
    return 'WasenderAPI free trial par hai (1 msg/min). Paid plan upgrade karein ya 60s wait karein.';
  }
  // Invalid number
  if (e.includes('invalid phone') || e.includes('invalid number')) {
    return `Number galat hai ya format theek nahi: ${rawError}`;
  }
  // API key issues
  if (e.includes('unauthorized') || e.includes('api key') || e.includes('token')) {
    return 'WasenderAPI key galat ya expire ho chuki hai. Admin settings mein check karein.';
  }
  // Session issues
  if (e.includes('session') || e.includes('disconnected') || e.includes('not connected')) {
    return 'WasenderAPI session disconnect hai. Dashboard par login karke session reconnect karein.';
  }
  return rawError;
}

// ─── Check if a phone is on WhatsApp ────────────────────────────
// Returns { exists, error } so caller knows why check failed
export async function checkOnWhatsAppDetailed(phone: string): Promise<{ exists: boolean; error?: string; raw?: any }> {
  const apiKey = await getApiKey();
  if (!apiKey) return { exists: false, error: 'WhatsApp API key not configured' };
  const waPhone = convertToWhatsAppPhone(phone);
  if (!waPhone) return { exists: false, error: `Invalid phone number: ${phone}` };

  try {
    const res = await fetch(`${WASENDER_BASE}/on-whatsapp/${waPhone}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json();
    if (res.ok) {
      const exists = data.exists === true || data.onWhatsApp === true || data.status === 'online';
      return { exists, raw: data };
    }
    return { exists: false, error: data?.message || data?.error || `HTTP ${res.status}`, raw: data };
  } catch (err: any) {
    return { exists: false, error: err?.message || 'Network error' };
  }
}

// ─── Backward-compatible wrapper ───
export async function checkOnWhatsApp(phone: string): Promise<boolean> {
  const result = await checkOnWhatsAppDetailed(phone);
  return result.exists;
}

// ─── Detect rate-limit error ───
function isRateLimitError(error: string): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  return e.includes('free trial') || e.includes('rate limit') || e.includes('every 1 minute') || e.includes('too many');
}

// ─── Sleep helper ───
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Send text message (with rate-limit retry + auto pre-check) ──
export async function sendTextMessage(
  to: string,
  message: string,
  opts: { skipPreCheck?: boolean; maxRetries?: number } = {}
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = await getApiKey();
  if (!apiKey) return { success: false, error: 'WhatsApp API key not configured' };

  const waPhone = convertToWhatsAppPhone(to);
  if (!waPhone) return { success: false, error: `Invalid phone number: ${to}` };

  // NOTE: Pre-check is DISABLED by default because WasenderAPI's /on-whatsapp/
  // endpoint is unreliable on free trial (returns false for valid WhatsApp numbers).
  // We rely on the send endpoint's response + translateWaError() instead.
  // Pre-check can be explicitly enabled via opts.skipPreCheck === false AND
  // a separate explicit "trustPreCheck" flag (not currently used in production).

  const maxRetries = opts.maxRetries ?? 2; // initial + 2 retries on rate-limit
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

      const errMsg = data?.message || data?.error || `HTTP ${res.status}`;
      lastError = errMsg;

      // If rate-limit error and we have retries left → wait 65s and retry
      if (isRateLimitError(errMsg) && attempt < maxRetries) {
        console.warn(`[WhatsApp] Rate-limited on attempt ${attempt + 1}, waiting 65s...`);
        await sleep(65_000);
        continue;
      }

      // Non-retryable error — translate to user-friendly message
      return { success: false, error: translateWaError(errMsg) };
    } catch (err: any) {
      lastError = err?.message || 'Network error';
      if (attempt < maxRetries) {
        await sleep(2000);
        continue;
      }
      return { success: false, error: translateWaError(lastError) };
    }
  }

  return { success: false, error: translateWaError(lastError) };
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
    'whatsapp_business_phone',
  ];
  const result: Record<string, string> = {};
  for (const key of keys) {
    result[key] = (await getConfig(key)) || '';
  }
  // Defaults
  if (!result['whatsapp_recovery_sms']) result['whatsapp_recovery_sms'] = 'false';
  if (!result['whatsapp_overdue_sms']) result['whatsapp_overdue_sms'] = 'false';
  if (!result['whatsapp_credit_sms']) result['whatsapp_credit_sms'] = 'false';
  if (!result['whatsapp_business_name']) result['whatsapp_business_name'] = 'AL-FALAH TRADERS KHANPUR';
  if (!result['whatsapp_business_phone']) result['whatsapp_business_phone'] = '0319-2538526';
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
    'whatsapp_business_phone',
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

// ─── Upload media to WasenderAPI ────────────────────────────────
async function uploadMedia(imageBuffer: Buffer, filename: string): Promise<string | null> {
  const apiKey = await getApiKey();
  if (!apiKey) return null;

  try {
    // WasenderAPI expects: { base64: "data:image/png;base64,..." }
    const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    const res = await fetch(`${WASENDER_BASE}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64: base64,
      }),
    });

    const data = await res.json();
    if (res.ok && data.url) {
      return data.url;
    }
    console.error('[WhatsApp] Upload media response:', JSON.stringify(data));
    return null;
  } catch (err) {
    console.error('[WhatsApp] Upload media error:', err);
    return null;
  }
}

// ─── Send image with caption (uploads then sends, with retry) ──
export async function sendImageWithReceipt(
  to: string,
  imageBuffer: Buffer,
  caption: string,
  opts: { skipPreCheck?: boolean; maxRetries?: number } = {}
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = await getApiKey();
  if (!apiKey) return { success: false, error: 'WhatsApp API key not configured' };

  const waPhone = convertToWhatsAppPhone(to);
  if (!waPhone) return { success: false, error: `Invalid phone number: ${to}` };

  // NOTE: Pre-check DISABLED — see sendTextMessage for explanation.

  // Step 1: Upload image to WasenderAPI
  const imageUrl = await uploadMedia(imageBuffer, `receipt_${Date.now()}.png`);
  if (!imageUrl) {
    // Fallback: send text only if image upload fails
    console.warn('[WhatsApp] Image upload failed, sending text only');
    return sendTextMessage(to, caption, opts);
  }

  const maxRetries = opts.maxRetries ?? 2;
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${WASENDER_BASE}/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          to: waPhone,
          image: { url: imageUrl },
          caption: caption,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        return { success: true, messageId: data?.key?.id || data?.messageId };
      }

      const errMsg = data?.message || data?.error || `HTTP ${res.status}`;
      lastError = errMsg;

      if (isRateLimitError(errMsg) && attempt < maxRetries) {
        console.warn(`[WhatsApp] Image send rate-limited on attempt ${attempt + 1}, waiting 65s...`);
        await sleep(65_000);
        continue;
      }

      return { success: false, error: translateWaError(errMsg) };
    } catch (err: any) {
      lastError = err?.message || 'Network error';
      if (attempt < maxRetries) {
        await sleep(2000);
        continue;
      }
      return { success: false, error: translateWaError(lastError) };
    }
  }

  return { success: false, error: translateWaError(lastError) };
}

// ─── Send recovery SMS with receipt image ───────────────────────
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
}): Promise<{ success: boolean; error?: string }> {
  const enabled = await isSmsEnabled('recovery');
  if (!enabled) return { success: false, error: 'Recovery SMS is disabled' };

  if (!opts.shopPhone) {
    return { success: false, error: 'Shop has no phone number' };
  }

  const businessName = await getConfig('whatsapp_business_name') || 'AL-FALAH TRADERS KHANPUR';
  const businessPhone = await getConfig('whatsapp_business_phone') || '0319-2538526';
  // Date format: 10-Jul-2026 (DD-Mon-YYYY)
  const date = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  });

  // Build message — formal receipt format with Urdu note
  const msg = [
    `${businessName}.`,
    '',
    `Dear ${opts.shopName},`,
    'Your account has been updated:',
    `Opening Balance: Rs. ${opts.previousBalance.toLocaleString('en-PK')}`,
    `Recovery Received: Rs. ${opts.amount.toLocaleString('en-PK')}`,
    `Remaining Balance: Rs. ${opts.newBalance.toLocaleString('en-PK')}`,
    `Date: ${date}`,
    '',
    '(اگر آپ کو بیلنس میں کسی بھی قسم کا کوئی فرق محسوس ہو تو برائے مہربانی دیے گئے نمبر پر لازمی رابطہ کریں تاکہ آپ کے اور ہمارے کاروبار میں کوئی نقصان نہ ہو۔ شکریہ!)',
    '',
    `Distributor No: ${businessPhone}`,
    'Thank you for your payment!',
  ].join('\n');

  // Generate receipt image
  let result;
  try {
    const { generateRecoveryReceipt } = await import('@/lib/whatsapp-receipts');
    const imageBuffer = await generateRecoveryReceipt({
      shopName: opts.shopName,
      amount: opts.amount,
      previousBalance: opts.previousBalance,
      newBalance: opts.newBalance,
      orderbookerName: opts.orderbookerName,
      date,
    });
    result = await sendImageWithReceipt(opts.shopPhone, imageBuffer as unknown as Buffer, msg);
  } catch (imgErr) {
    console.error('[WhatsApp] Receipt image failed, sending text only:', imgErr);
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

// ─── Send overdue reminder SMS with image ──────────────────────
export async function sendOverdueSms(opts: {
  shopId: string;
  shopName: string;
  shopPhone: string | null;
  shopArea?: string | null;
  shopAddress?: string | null;
  companyName?: string | null;
  balance: number;
  daysOverdue: number;
}): Promise<{ success: boolean; error?: string }> {
  if (!opts.shopPhone) return { success: false, error: 'No phone' };

  const businessName = await getConfig('whatsapp_business_name') || 'AL-FALAH TRADERS KHANPUR';
  const businessPhone = await getConfig('whatsapp_business_phone') || '0319-2538526';

  // Build message — lines only included if data is available
  const lines: string[] = ['⚠️ Payment Reminder'];

  // 🏬 Company (if known)
  if (opts.companyName && opts.companyName.trim()) {
    lines.push(`🏬 ${opts.companyName.trim()}.`);
  }

  // 🏪 Shop name (always)
  lines.push(`🏪 ${opts.shopName}`);

  // 📍 Area / Address (prefer area, fallback to address)
  const location = opts.shopArea?.trim() || opts.shopAddress?.trim();
  if (location) {
    lines.push(`📍 ${location}`);
  }

  // 💰 Outstanding + 📅 Overdue
  lines.push(`💰 Outstanding: Rs ${opts.balance.toLocaleString('en-PK')}`);
  lines.push(`📅 Overdue: ${opts.daysOverdue} days`);

  // English + Urdu request
  lines.push('');
  lines.push('Please make payment at your earliest convenience.');
  lines.push('');
  lines.push('براہِ کرم اپنی بقایا رقم جلد از جلد کلیئر کریں۔ اگر آپ ادائیگی کر چکے ہیں اور اپ ڈیٹ نہیں ہوئی، تو برائے مہربانی دیے گئے نمبر پر رابطہ کریں۔');
  lines.push('');
  lines.push(`Contact: ${businessPhone}`);
  lines.push(`— ${businessName}.`);

  const msg = lines.join('\n');

  // Generate overdue reminder image
  let result;
  try {
    const { generateOverdueImage } = await import('@/lib/whatsapp-receipts');
    const imageBuffer = await generateOverdueImage({
      shopName: opts.shopName,
      balance: opts.balance,
      daysOverdue: opts.daysOverdue,
    });
    result = await sendImageWithReceipt(opts.shopPhone, imageBuffer as unknown as Buffer, msg);
  } catch (imgErr) {
    console.error('[WhatsApp] Overdue image failed, sending text only:', imgErr);
    result = await sendTextMessage(opts.shopPhone, msg);
  }

  await logSms(
    opts.shopId, opts.shopName, opts.shopPhone, null, null,
    'whatsapp', result.success ? 'sent' : 'failed',
    msg, result.success ? undefined : result.error
  );

  return result;
}

// ─── Send credit SMS with receipt image ────────────────────────
export async function sendCreditSms(opts: {
  shopId: string;
  shopName: string;
  shopPhone: string | null;
  orderbookerId: string | null;
  transactionId: string;
  amount: number;
  previousBalance?: number;
  newBalance: number;
  companyName?: string;
}): Promise<{ success: boolean; error?: string }> {
  const enabled = await isSmsEnabled('credit');
  if (!enabled) return { success: false, error: 'Credit SMS is disabled' };

  if (!opts.shopPhone) return { success: false, error: 'No phone' };

  const businessName = await getConfig('whatsapp_business_name') || 'AL-FALAH TRADERS KHANPUR';
  const businessPhone = await getConfig('whatsapp_business_phone') || '0319-2538526';
  // Date format: 10-Jul-2026 (DD-Mon-YYYY) in Asia/Karachi timezone
  const date = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  });

  // previousBalance: caller se pass ho to use karo, warna fallback calculate karo
  // (newBalance = previousBalance + amount → previousBalance = newBalance - amount)
  const prevBal = opts.previousBalance !== undefined
    ? opts.previousBalance
    : Math.round((opts.newBalance - opts.amount) * 100) / 100;

  // Build message — formal receipt format matching recovery SMS style
  const msg = [
    `${businessName}.`,
    '',
    `Dear ${opts.shopName},`,
    'Your account has been updated with new Invoice/credit:',
    '',
    `Previous Balance: Rs. ${prevBal.toLocaleString('en-PK')}`,
    `New Invoice Amount: Rs. ${opts.amount.toLocaleString('en-PK')}`,
    `Total Balance: Rs. ${opts.newBalance.toLocaleString('en-PK')}`,
    '',
    `Date: ${date}`,
    '',
    '(اگر آپ کو بیلنس میں کسی بھی قسم کا کوئی فرق محسوس ہو تو برائے مہربانی دیے گئے نمبر پر لازمی رابطہ کریں تاکہ آپ کے اور ہمارے کاروبار میں کوئی نقصان نہ ہو۔ شکریہ!)',
    `Distributor No: ${businessPhone}`,
    '',
    'Thank you for doing business with us!',
  ].join('\n');

  // Generate credit receipt image
  let result;
  try {
    const { generateCreditReceipt } = await import('@/lib/whatsapp-receipts');
    const imageBuffer = await generateCreditReceipt({
      shopName: opts.shopName,
      amount: opts.amount,
      newBalance: opts.newBalance,
      companyName: opts.companyName,
      date,
    });
    result = await sendImageWithReceipt(opts.shopPhone, imageBuffer as unknown as Buffer, msg);
  } catch (imgErr) {
    console.error('[WhatsApp] Credit image failed, sending text only:', imgErr);
    result = await sendTextMessage(opts.shopPhone, msg);
  }

  await logSms(
    opts.shopId, opts.shopName, opts.shopPhone, opts.orderbookerId,
    opts.transactionId, 'whatsapp',
    result.success ? 'sent' : 'failed',
    msg, result.success ? undefined : result.error
  );

  return result;
}
