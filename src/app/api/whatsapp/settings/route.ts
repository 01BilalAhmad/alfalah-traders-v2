import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getPool } from '@/lib/pg';
import { getWhatsAppSettings, updateWhatsAppSettings, sendTextMessage, isSmsEnabled, sendOverdueSms } from '@/lib/whatsapp';

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

  // ─── Action: Send Overdue Reminders ───
  if (body.action === 'send-overdue') {
    const enabled = await isSmsEnabled('overdue');
    if (!enabled) {
      return NextResponse.json({ success: false, error: 'Overdue SMS is disabled. Enable the toggle first.' }, { status: 400 });
    }

    const pool = getPool();
    const overdueRes = await pool.query(
      `SELECT s.id, s.name, s.phone, s.balance,
              (SELECT MAX(t."createdAt") FROM "Transaction" t
               WHERE t."shopId" = s.id AND t.type = 'recovery' AND t.status = 'approved') AS "lastRecoveryDate"
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

      // Rate limit: 500ms between messages
      await new Promise(r => setTimeout(r, 500));
    }

    return NextResponse.json({
      success: true,
      totalShops: overdueRes.rows.length,
      sent, failed, skipped,
      results: results.slice(0, 50),
    });
  }

  // ─── Default: Test SMS ───
  const { phone } = body;
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });

  const result = await sendTextMessage(
    phone,
    '🧪 Test Message\n\nWhatsApp API is working!\n— AL-FALAH TRADERS'
  );

  if (result.success) {
    return NextResponse.json({ success: true, message: 'Test SMS sent!' });
  }
  return NextResponse.json({ success: false, error: result.error }, { status: 400 });
}
