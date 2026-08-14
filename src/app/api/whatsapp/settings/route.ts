import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getPool } from '@/lib/pg';
import { getWhatsAppSettings, updateWhatsAppSettings, sendTextMessage, isSmsEnabled, sendOverdueSms, sendImageWithReceipt } from '@/lib/whatsapp';

// GET /api/whatsapp/settings — get all WhatsApp settings
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const settings = await getWhatsAppSettings();
  if (settings.whatsapp_api_key && settings.whatsapp_api_key.length > 8) {
    settings.whatsapp_api_key_masked = '••••' + settings.whatsapp_api_key.slice(-4);
    delete settings.whatsapp_api_key;
  }
  return NextResponse.json({ settings });
}

// PATCH /api/whatsapp/settings — update settings
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await request.json();
  await updateWhatsAppSettings(body);
  return NextResponse.json({ success: true });
}

// POST /api/whatsapp/settings — test SMS OR manual overdue SMS
// Body: { phone: "xxx" } for test SMS
// Body: { action: "send-overdue" } for manual overdue SMS
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await request.json();

  // ─── Action: Send single overdue SMS to one shop ───
  if (body.action === 'send-single-overdue') {
    const { shopId, shopName, shopPhone, shopArea, shopAddress, companyName, balance, daysOverdue } = body;
    if (!shopPhone) {
      return NextResponse.json({ success: false, error: 'No phone number' }, { status: 400 });
    }
    const result = await sendOverdueSms({
      shopId,
      shopName,
      shopPhone,
      shopArea,
      shopAddress,
      companyName,
      balance: Number(balance) || 0,
      daysOverdue: Number(daysOverdue) || 0,
    });
    if (result.success) {
      return NextResponse.json({ success: true, message: `Reminder sent to ${shopName}` });
    }
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  // ─── Action: Check if a single number is on WhatsApp ───
  if (body.action === 'check-number') {
    const { phone } = body;
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Phone required' }, { status: 400 });
    }
    const { checkOnWhatsAppDetailed } = await import('@/lib/whatsapp');
    const check = await checkOnWhatsAppDetailed(phone);
    return NextResponse.json({
      success: true,
      exists: check.exists,
      waPhone: check.raw,
      error: check.error,
    });
  }

  // ─── Action: Bulk check multiple numbers ───
  if (body.action === 'check-numbers') {
    const { phones } = body as { phones: string[] };
    if (!Array.isArray(phones) || phones.length === 0) {
      return NextResponse.json({ success: false, error: 'phones array required' }, { status: 400 });
    }
    const { checkOnWhatsAppDetailed } = await import('@/lib/whatsapp');
    const results: Array<{ phone: string; exists: boolean; error?: string }> = [];
    for (const phone of phones.slice(0, 100)) {
      const check = await checkOnWhatsAppDetailed(phone);
      results.push({ phone, exists: check.exists, error: check.error });
      // Small delay to avoid hitting rate limit on check API
      await new Promise(r => setTimeout(r, 200));
    }
    return NextResponse.json({ success: true, results });
  }

  // ─── Action: Send Overdue Reminders (bulk) ───
  if (body.action === 'send-overdue') {
    const enabled = await isSmsEnabled('overdue');
    if (!enabled) {
      return NextResponse.json({ success: false, error: 'Overdue SMS is disabled. Enable the toggle first.' }, { status: 400 });
    }

    const pool = getPool();
    const overdueRes = await pool.query(
      `SELECT s.id, s.name, s.phone, s.balance, s.area, s.address,
              (SELECT MAX(t."createdAt") FROM "Transaction" t
               WHERE t."shopId" = s.id AND t.type = 'recovery' AND t.status = 'approved') AS "lastRecoveryDate",
              (SELECT string_agg(DISTINCT c.name, ', ')
               FROM "ShopCompanyBalance" scb
               JOIN "Company" c ON c.id = scb."companyId"
               WHERE scb."shopId" = s.id AND scb.balance > 0
               LIMIT 1) AS "companyName"
       FROM "Shop" s
       WHERE s.status = 'active' AND s.balance > 0 AND s.phone IS NOT NULL AND s.phone != ''
       ORDER BY s.balance DESC
       LIMIT 200`
    );

    const now = Date.now();
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const results: any[] = [];

    for (const shop of overdueRes.rows) {
      const lastRecovery = shop.lastRecoveryDate ? new Date(shop.lastRecoveryDate).getTime() : 0;
      const daysSince = Math.floor((now - lastRecovery) / (1000 * 60 * 60 * 24));

      if (daysSince < 14 && lastRecovery > 0) {
        skipped++;
        continue;
      }

      // Dedup: skip if sent in last 24h
      const todaySent = await pool.query(
        `SELECT 1 FROM "SmsLog"
         WHERE "shopId" = $1 AND method = 'whatsapp' AND status = 'sent'
           AND "sentAt" >= NOW() - INTERVAL '24 hours'
         LIMIT 1`,
        [shop.id]
      );
      if (todaySent.rows.length > 0) {
        skipped++;
        continue;
      }

      const result = await sendOverdueSms({
        shopId: shop.id,
        shopName: shop.name,
        shopPhone: shop.phone,
        shopArea: shop.area,
        shopAddress: shop.address,
        companyName: shop.companyName,
        balance: Number(shop.balance) || 0,
        daysOverdue: daysSince,
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
      }

      results.push({
        shopName: shop.name,
        phone: shop.phone,
        balance: Number(shop.balance) || 0,
        daysOverdue: daysSince,
        status: result.success ? 'sent' : 'failed',
        error: result.error,
      });

      // Smart rate-limit pacing: WasenderAPI free trial allows 1 msg/min.
      // Wait 65s between sends to avoid rate-limit. Paid plans can reduce this.
      // Detect if previous send was rate-limited → extend delay.
      if (result.error && result.error.toLowerCase().includes('free trial')) {
        // Already retried inside sendOverdueSms; if still failing, wait longer.
        await new Promise(r => setTimeout(r, 70_000));
      } else {
        await new Promise(r => setTimeout(r, 65_000)); // 1 min spacing for free trial
      }
    }

    return NextResponse.json({
      success: true,
      totalShops: overdueRes.rows.length,
      sent, failed, skipped,
      results: results.slice(0, 50),
    });
  }

  // ─── Default: Test SMS with image ───
  const { phone } = body;
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });

  const testMsg = '🧪 Test Message\n\nWhatsApp API is working!\n— AL-FALAH TRADERS';

  // Test SMS skips pre-check (user wants to verify API is working, not the number)
  // and uses maxRetries=1 to keep response time reasonable.
  const sendOpts = { skipPreCheck: true, maxRetries: 1 };

  // Try to send with receipt image
  let result;
  try {
    const { generateRecoveryReceipt } = await import('@/lib/whatsapp-receipts');
    const imageBuffer = await generateRecoveryReceipt({
      shopName: 'TEST SHOP',
      amount: 1000,
      previousBalance: 5000,
      newBalance: 4000,
      orderbookerName: 'Test OB',
      date: new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }),
    });
    result = await sendImageWithReceipt(phone, imageBuffer as unknown as Buffer, testMsg, sendOpts);
  } catch (imgErr) {
    console.error('[WhatsApp test] Image failed, sending text:', imgErr);
    result = await sendTextMessage(phone, testMsg, sendOpts);
  }

  if (result.success) {
    return NextResponse.json({ success: true, message: 'Test SMS with image sent!' });
  }
  return NextResponse.json({ success: false, error: result.error }, { status: 400 });
}
