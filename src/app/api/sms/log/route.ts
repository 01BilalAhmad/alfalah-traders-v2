import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import crypto from 'crypto';

// POST /api/sms/log
// Called by the mobile app after SMS/WhatsApp is sent, skipped, or failed.
// Records the event in the SmsLog table so admin can track OB SMS activity.
//
// Body:
//   {
//     shopId, shopName, shopPhone, orderbookerId, transactionId?,
//     method: "sms" | "whatsapp",
//     status: "sent" | "failed" | "skipped",
//     message?: string,        // SMS content (truncated for audit)
//     errorMessage?: string,   // reason if failed
//     sentAt?: string (ISO)    // optional — defaults to now
//   }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      shopId, shopName, shopPhone, orderbookerId, transactionId,
      method, status, message, errorMessage, sentAt,
    } = body;

    // Validate required fields
    if (!shopId || !orderbookerId || !method || !status) {
      return NextResponse.json(
        { error: 'shopId, orderbookerId, method, and status are required' },
        { status: 400 }
      );
    }

    if (!['sms', 'whatsapp'].includes(method)) {
      return NextResponse.json(
        { error: 'method must be "sms" or "whatsapp"' },
        { status: 400 }
      );
    }

    if (!['sent', 'failed', 'skipped'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be "sent", "failed", or "skipped"' },
        { status: 400 }
      );
    }

    const pool = getPool();
    const now = new Date();
    const sentAtDate = sentAt ? new Date(sentAt) : now;
    // Truncate message to 500 chars to avoid bloat
    const truncatedMessage = message ? message.substring(0, 500) : null;

    // ── Duplicate prevention ──────────────────────────────────────
    // Check if a SMS log with same shopId + orderbookerId + method + status
    // already exists within the last 5 minutes of the sentAt timestamp.
    // This prevents duplicates when:
    //   1. App sends log online → succeeds on server → network drops → app retries
    //   2. App saves to offline queue → syncs → same log uploaded again
    const FIVE_MIN_MS = 5 * 60 * 1000;
    const windowStart = new Date(sentAtDate.getTime() - FIVE_MIN_MS);
    const windowEnd = new Date(sentAtDate.getTime() + FIVE_MIN_MS);

    try {
      const existingRes = await pool.query(
        `SELECT id FROM "SmsLog"
         WHERE "shopId" = $1
           AND "orderbookerId" = $2
           AND method = $3
           AND status = $4
           AND "sentAt" >= $5
           AND "sentAt" <= $6
         LIMIT 1`,
        [shopId, orderbookerId, method, status, windowStart, windowEnd]
      );

      if (existingRes.rows.length > 0) {
        // Duplicate — return existing log ID
        console.log(`[SmsLog] Duplicate prevented: shop=${shopId}, OB=${orderbookerId}, method=${method}, status=${status}`);
        return NextResponse.json({
          success: true,
          id: existingRes.rows[0].id,
          _duplicate_prevented: true,
        }, { status: 200 });
      }
    } catch (dupCheckErr) {
      console.error('[SmsLog] Duplicate check failed (non-blocking):', dupCheckErr);
      // Continue with insert — better to have a duplicate than to lose the log
    }

    const id = `smslog_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    await pool.query(
      `INSERT INTO "SmsLog" (id, "shopId", "shopName", "shopPhone", "orderbookerId", "transactionId", method, status, message, "errorMessage", "sentAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        shopId,
        shopName || 'Unknown Shop',
        shopPhone || '',
        orderbookerId,
        transactionId || null,
        method,
        status,
        truncatedMessage,
        errorMessage || null,
        sentAtDate,
        now,
      ]
    );

    console.log(`[SmsLog] Created: method=${method}, status=${status}, shop=${shopName}, OB=${orderbookerId}`);

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error('[SmsLog] Error creating log:', error);
    return NextResponse.json({ error: 'Failed to create SMS log' }, { status: 500 });
  }
}
