import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { isSmsEnabled, sendOverdueSms } from '@/lib/whatsapp';

// GET /api/cron/whatsapp-overdue
// Called by Vercel Cron daily at 10 AM PKT (5 AM UTC)
// Sends overdue reminder WhatsApp SMS to shops with balance > 0 and
// last recovery > 14 days ago.
//
// Vercel cron config in vercel.json:
// { "path": "/api/cron/whatsapp-overdue", "schedule": "0 5 * * *" }
export async function GET(request: NextRequest) {
  try {
    // Verify it's a Vercel cron call (no auth required — cron is internal)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const enabled = await isSmsEnabled('overdue');
    if (!enabled) {
      return NextResponse.json({ success: true, message: 'Overdue SMS disabled, skipping', sent: 0 });
    }

    const pool = getPool();

    // Find overdue shops: balance > 0, last credit > 14 days (or never)
    // Using lastCreditDate to match UI (which displays daysSinceCredit)
    const overdueRes = await pool.query(
      `SELECT s.id, s.name, s.phone, s.balance, s.area, s.address,
              (SELECT MAX(t."createdAt") FROM "Transaction" t
               WHERE t."shopId" = s.id AND t.type = 'recovery' AND t.status = 'approved') AS "lastRecoveryDate",
              (SELECT MAX(t."createdAt") FROM "Transaction" t
               WHERE t."shopId" = s.id AND t.type = 'credit' AND t.status = 'approved') AS "lastCreditDate",
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

    for (const shop of overdueRes.rows) {
      const lastRecovery = shop.lastRecoveryDate ? new Date(shop.lastRecoveryDate).getTime() : 0;
      const lastCredit = shop.lastCreditDate ? new Date(shop.lastCreditDate).getTime() : 0;
      // Match UI: daysSinceCredit (fallback to daysSinceRecovery if no credit)
      const daysSinceCredit = lastCredit > 0 ? Math.floor((now - lastCredit) / (1000 * 60 * 60 * 24)) : 0;
      const daysSinceRecovery = lastRecovery > 0 ? Math.floor((now - lastRecovery) / (1000 * 60 * 60 * 24)) : 0;
      const daysSince = daysSinceCredit || daysSinceRecovery || 0;

      // Skip if not yet overdue (14+ days since last credit OR recovery)
      const effectiveDays = daysSinceCredit > 0 ? daysSinceCredit : daysSinceRecovery;
      if (effectiveDays > 0 && effectiveDays < 14) {
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

      // Rate limit: 500ms between messages (avoid WhatsApp ban)
      await new Promise(r => setTimeout(r, 500));
    }

    return NextResponse.json({
      success: true,
      totalShops: overdueRes.rows.length,
      sent, failed, skipped,
    });
  } catch (error) {
    console.error('[Cron WhatsApp Overdue] error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
