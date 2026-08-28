import { NextRequest, NextResponse } from 'next/server';
import { isSmsEnabled, sendOverdueSms } from '@/lib/whatsapp';
import { getOverdueShops, OVERDUE_THRESHOLD_DAYS } from '@/lib/overdue';

// GET /api/cron/whatsapp-overdue
// Called by Vercel Cron daily at 10 AM PKT (5 AM UTC)
// Sends overdue reminder WhatsApp SMS to shops whose OLDEST unpaid credit
// is 14+ days old (FIFO aging — see src/lib/overdue.ts).
//
// Vercel cron config in vercel.json:
// { "path": "/api/cron/whatsapp-overdue", "schedule": "0 5 * * *" }
//
// Query params:
//   ?dryRun=1 — return the list of shops that WOULD be notified, but
//              DON'T send any SMS. Useful for verification before deploy.
export async function GET(request: NextRequest) {
  try {
    // Verify it's a Vercel cron call (no auth required — cron is internal)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // dryRun mode — bypass SMS-enabled toggle so admins can preview
    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

    if (!dryRun) {
      const enabled = await isSmsEnabled('overdue');
      if (!enabled) {
        return NextResponse.json({ success: true, message: 'Overdue SMS disabled, skipping', sent: 0 });
      }
    }

    // ── NEW: FIFO-based overdue detection ──
    // Old logic looked only at the LATEST credit/recovery date (MAX(createdAt))
    // which had a bug: a fresh small bill would reset the overdue clock and
    // the shop would no longer be flagged as overdue — even if older bills
    // were still unpaid.
    //
    // FIFO logic applies every recovery against the OLDEST outstanding credit
    // first, and a shop is overdue only if ANY unpaid credit is 14+ days old.
    // See src/lib/overdue.ts for full implementation + safety notes.
    const overdueShops = await getOverdueShops({
      includeNonOverdue: false,    // only return shops that are actually overdue
      minDays: OVERDUE_THRESHOLD_DAYS,
      limit: 200,
    });

    // In dryRun mode, return what WOULD be sent — no SMS, no logging
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        thresholdDays: OVERDUE_THRESHOLD_DAYS,
        totalOverdueShops: overdueShops.length,
        shops: overdueShops.map((s) => ({
          shopId: s.shopId,
          shopName: s.shopName,
          shopArea: s.shopArea,
          shopPhone: s.shopPhone,
          orderbookerId: s.orderbookerId,
          orderbookerName: s.orderbookerName,
          totalBalance: s.totalBalance,
          fifoTotalBalance: s.fifoTotalBalance,
          overdueAmount: s.overdueAmount,
          daysOverdue: s.daysOverdue,
          oldestUnpaidCreditDate: s.oldestUnpaidCreditDate,
          fifoMatchesShopBalance: s.fifoMatchesShopBalance,
          companyName: s.companyName,
          unpaidBills: s.unpaidBills,
          // Flag shops where FIFO total differs from Shop.balance — these need
          // manual review before SMS goes out (likely claims or rounding)
          needsReview: !s.fifoMatchesShopBalance,
        })),
      });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let needsReviewCount = 0;

    for (const shop of overdueShops) {
      // Safety net — if FIFO total doesn't match Shop.balance, log and skip.
      // We don't want to send an SMS with mismatched numbers (e.g. showing
      // 5,000 overdue when actual outstanding is 8,000 due to claims).
      // The admin should manually review these via the dryRun report.
      if (!shop.fifoMatchesShopBalance) {
        console.warn(
          `[Cron WhatsApp Overdue] Shop ${shop.shopId} (${shop.shopName}) — ` +
          `FIFO total ${shop.fifoTotalBalance} ≠ Shop.balance ${shop.totalBalance}. Skipping SMS, needs manual review.`
        );
        needsReviewCount++;
        skipped++;
        continue;
      }

      // Dedup: skip if sent in last 24h (prevents duplicate reminders)
      // — same as old logic, kept for backward compat
      const { getPool } = await import('@/lib/pg');
      const pool = getPool();
      const todaySent = await pool.query(
        `SELECT 1 FROM "SmsLog"
         WHERE "shopId" = $1 AND method = 'whatsapp' AND status = 'sent'
           AND "sentAt" >= NOW() - INTERVAL '24 hours'
         LIMIT 1`,
        [shop.shopId]
      );
      if (todaySent.rows.length > 0) {
        skipped++;
        continue;
      }

      // Build per-bill detail lines for SMS (top 3 oldest unpaid bills)
      const detailBills = shop.unpaidBills.slice(0, 3).map((b) => ({
        date: new Date(b.date).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi',
        }),
        amount: b.remaining,
        daysOld: b.daysOld,
      }));

      const result = await sendOverdueSms({
        shopId: shop.shopId,
        shopName: shop.shopName,
        shopPhone: shop.shopPhone,
        shopArea: shop.shopArea,
        shopAddress: shop.shopAddress,
        companyName: shop.companyName,
        // ── NEW fields — three-tier transparency so shopkeeper doesn't get
        // confused between total balance (what orderbooker says) and overdue
        // amount (what triggered this reminder)
        totalBalance: shop.totalBalance,         // = Shop.balance, what OB tells them
        overdueAmount: shop.overdueAmount,        // portion of outstanding 14+ days old
        daysOverdue: shop.daysOverdue,            // since oldest unpaid credit (correct!)
        detailBills,                              // top 3 oldest unpaid bills
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
      totalShops: overdueShops.length,
      sent,
      failed,
      skipped,
      needsReviewCount,
      thresholdDays: OVERDUE_THRESHOLD_DAYS,
    });
  } catch (error) {
    console.error('[Cron WhatsApp Overdue] error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
