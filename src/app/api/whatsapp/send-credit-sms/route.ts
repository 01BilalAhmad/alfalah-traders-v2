import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getPool } from '@/lib/pg';
import { sendCreditSms, isSmsEnabled } from '@/lib/whatsapp';

// POST /api/whatsapp/send-credit-sms
// Manually trigger credit SMS to shopkeepers for verified credit transactions.
//
// Body:
//   { transactionIds: string[] }   — specific transactions to send SMS for
//   OR
//   { date: "YYYY-MM-DD", companyIds?: string[], orderbookerIds?: string[] }
//     — send SMS for ALL credit transactions matching these filters
//
// Returns:
//   { success, smsSummary: { total, sent, failed, skipped, details: [...] } }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await request.json();
  const { transactionIds, date, companyIds, orderbookerIds } = body;

  const pool = getPool();

  // ─── Build transaction query ─────────────────────────────────
  let txnQuery: string;
  let params: any[] = [];

  if (Array.isArray(transactionIds) && transactionIds.length > 0) {
    // Mode 1: explicit transaction IDs
    const placeholders = transactionIds.map((_: unknown, idx: number) => `$${idx + 1}`).join(', ');
    txnQuery = `
      SELECT t.id, t.amount, t."previousBalance", t."newBalance", t."companyId",
             t."shopId", s.name AS "shopName", s.phone AS "shopPhone",
             s."orderbookerId", s.area AS "shopArea", s.address AS "shopAddress",
             u.name AS "creatorName",
             c.name AS "companyName",
             (SELECT 1 FROM "SmsLog" sl
              WHERE sl."transactionId" = t.id AND sl.method = 'whatsapp' AND sl.status = 'sent'
              LIMIT 1) AS "alreadySent"
      FROM "Transaction" t
      LEFT JOIN "Shop" s ON t."shopId" = s.id
      LEFT JOIN "User" u ON t."createdBy" = u.id
      LEFT JOIN "Company" c ON t."companyId" = c.id
      WHERE t.id IN (${placeholders})
        AND t.type = 'credit'
        AND t.status = 'approved'
    `;
    params = transactionIds;
  } else if (date) {
    // Mode 2: filter by date (+ optional company/OB filters)
    // Pakistan timezone: UTC+5
    const pkOffsetMs = 5 * 60 * 60 * 1000;
    const [y, m, d] = date.split('-').map(Number);
    const startUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).getTime() - pkOffsetMs;
    const endUTC = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)).getTime() - pkOffsetMs;

    const conditions: string[] = [
      `t.type = 'credit'`,
      `t.status = 'approved'`,
      `t."createdAt" >= $1`,
      `t."createdAt" <= $2`,
    ];
    params = [new Date(startUTC), new Date(endUTC)];
    let paramIdx = 3;

    if (Array.isArray(companyIds) && companyIds.length > 0) {
      const ph = companyIds.map((_: unknown, idx: number) => `$${paramIdx + idx}`).join(', ');
      conditions.push(`t."companyId" IN (${ph})`);
      params.push(...companyIds);
      paramIdx += companyIds.length;
    }

    if (Array.isArray(orderbookerIds) && orderbookerIds.length > 0) {
      const ph = orderbookerIds.map((_: unknown, idx: number) => `$${paramIdx + idx}`).join(', ');
      conditions.push(`s."orderbookerId" IN (${ph})`);
      params.push(...orderbookerIds);
      paramIdx += orderbookerIds.length;
    }

    txnQuery = `
      SELECT t.id, t.amount, t."previousBalance", t."newBalance", t."companyId",
             t."shopId", s.name AS "shopName", s.phone AS "shopPhone",
             s."orderbookerId", s.area AS "shopArea", s.address AS "shopAddress",
             u.name AS "creatorName",
             c.name AS "companyName",
             (SELECT 1 FROM "SmsLog" sl
              WHERE sl."transactionId" = t.id AND sl.method = 'whatsapp' AND sl.status = 'sent'
              LIMIT 1) AS "alreadySent"
      FROM "Transaction" t
      LEFT JOIN "Shop" s ON t."shopId" = s.id
      LEFT JOIN "User" u ON t."createdBy" = u.id
      LEFT JOIN "Company" c ON t."companyId" = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t."createdAt" DESC
      LIMIT 500
    `;
  } else {
    return NextResponse.json(
      { error: 'Either transactionIds array or date string is required' },
      { status: 400 }
    );
  }

  let txnRes;
  try {
    txnRes = await pool.query(txnQuery, params);
  } catch (err) {
    console.error('[send-credit-sms] Query error:', err);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }

  if (txnRes.rows.length === 0) {
    return NextResponse.json({
      success: true,
      smsSummary: { total: 0, sent: 0, failed: 0, skipped: 0, details: [] },
      message: 'No matching credit transactions found',
    });
  }

  // ─── Check if credit SMS is enabled ──────────────────────────
  const smsEnabled = await isSmsEnabled('credit');

  const smsSummary: {
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    details: Array<{
      shopName: string;
      shopPhone: string | null;
      status: 'sent' | 'failed' | 'skipped';
      error?: string;
    }>;
  } = { total: 0, sent: 0, failed: 0, skipped: 0, details: [] };

  if (!smsEnabled) {
    // All skipped — feature disabled
    for (const txn of txnRes.rows) {
      smsSummary.total++;
      smsSummary.skipped++;
      smsSummary.details.push({
        shopName: txn.shopName,
        shopPhone: txn.shopPhone || null,
        status: 'skipped',
        error: 'Credit SMS disabled in settings',
      });
    }
    return NextResponse.json({
      success: true,
      smsSummary,
      message: 'Credit SMS is disabled. Enable it in WhatsApp Settings first.',
    });
  }

  // ─── Send SMS to each transaction ────────────────────────────
  for (const txn of txnRes.rows) {
    smsSummary.total++;

    if (!txn.shopPhone) {
      smsSummary.skipped++;
      smsSummary.details.push({
        shopName: txn.shopName,
        shopPhone: null,
        status: 'skipped',
        error: 'Shop has no phone number',
      });
      continue;
    }

    if (txn.alreadySent) {
      smsSummary.skipped++;
      smsSummary.details.push({
        shopName: txn.shopName,
        shopPhone: txn.shopPhone,
        status: 'skipped',
        error: 'SMS already sent for this transaction',
      });
      continue;
    }

    try {
      const result = await sendCreditSms({
        shopId: txn.shopId,
        shopName: txn.shopName,
        shopPhone: txn.shopPhone,
        orderbookerId: txn.orderbookerId || txn.createdBy,
        transactionId: txn.id,
        amount: Number(txn.amount),
        previousBalance: Number(txn.previousBalance),
        newBalance: Number(txn.newBalance),
        companyName: txn.companyName || undefined,
      });

      if (result.success) {
        smsSummary.sent++;
        smsSummary.details.push({
          shopName: txn.shopName,
          shopPhone: txn.shopPhone,
          status: 'sent',
        });
      } else {
        smsSummary.failed++;
        smsSummary.details.push({
          shopName: txn.shopName,
          shopPhone: txn.shopPhone,
          status: 'failed',
          error: result.error || 'Unknown error',
        });
      }
    } catch (err: any) {
      smsSummary.failed++;
      smsSummary.details.push({
        shopName: txn.shopName,
        shopPhone: txn.shopPhone,
        status: 'failed',
        error: err?.message || 'SMS send threw exception',
      });
    }

    // Rate-limit pacing: WasenderAPI free trial allows 1 msg/min.
    // Wait 65s between sends (except after the last one).
    const isLast = txn.id === txnRes.rows[txnRes.rows.length - 1].id;
    if (!isLast) {
      await new Promise(r => setTimeout(r, 65_000));
    }
  }

  return NextResponse.json({
    success: true,
    smsSummary,
  });
}
