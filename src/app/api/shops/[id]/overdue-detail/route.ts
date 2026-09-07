import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { getOverdueInfoForShop } from '@/lib/overdue';

// GET /api/shops/[id]/overdue-detail
// Full FIFO overdue breakdown for ONE shop — powers the per-shop
// "Overdue Detail" print report on the admin Overdue Shops page.
//
// Returns EVERY unpaid bill (not just the top 5) with dates, so the
// printed report shows the complete overdue picture:
//   - shop info (name, area, address, phone, orderbooker, company)
//   - totalBalance (Shop.balance — authoritative)
//   - overdueAmount (unpaid portion of bills 14+ days old)
//   - daysOverdue + oldestUnpaidCreditDate
//   - unpaidBills[] — ALL unpaid bills: { date, amount, remaining, daysOld }
//   - lastCreditDate / lastRecoveryDate (display columns)
//   - fifoMatchesShopBalance sanity flag
//
// Admin-only.

function toIso(v: unknown): string | null {
  if (!v) return null;
  try {
    return new Date(v as any).toISOString();
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: shopId } = await params;

    // Full FIFO breakdown (all unpaid bills, oldest first)
    const info = await getOverdueInfoForShop(shopId);
    if (!info) {
      return NextResponse.json(
        { error: 'Shop not found or no outstanding balance' },
        { status: 404 }
      );
    }

    // Latest transaction dates for display
    const pool = getPool();
    const datesRes = await pool.query(
      `SELECT
         MAX(CASE WHEN t.type = 'credit' THEN t."createdAt" END) AS "lastCredit",
         MAX(CASE WHEN t.type = 'recovery' THEN t."createdAt" END) AS "lastRecovery"
       FROM "Transaction" t
       WHERE t."shopId" = $1 AND t.status = 'approved'`,
      [shopId]
    );
    const dates = datesRes.rows[0] || {};

    const now = Date.now();
    const unpaidBills = (info.unpaidBills || []).map((b) => {
      const iso = b.date ? new Date(b.date).toISOString() : null;
      const daysOld = iso
        ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)))
        : null;
      return {
        date: iso,
        amount: b.amount,
        remaining: b.remaining,
        daysOld,
        companyId: b.companyId ?? null,
      };
    });

    return NextResponse.json({
      v2: true,
      shop: {
        id: info.shopId,
        name: info.shopName,
        area: info.shopArea,
        address: info.shopAddress,
        phone: info.shopPhone,
        orderbookerName: info.orderbookerName,
        companyName: info.companyName,
      },
      totalBalance: info.totalBalance,
      fifoTotalBalance: info.fifoTotalBalance,
      overdueAmount: info.overdueAmount,
      daysOverdue: info.daysOverdue,
      oldestUnpaidCreditDate: info.oldestUnpaidCreditDate,
      isOverdue: info.isOverdue,
      unpaidBills,
      unpaidBillCount: unpaidBills.length,
      fifoMatchesShopBalance: info.fifoMatchesShopBalance,
      lastCreditDate: toIso(dates.lastCredit),
      lastRecoveryDate: toIso(dates.lastRecovery),
    });
  } catch (error) {
    console.error('[Shop Overdue Detail API] error:', error);
    return NextResponse.json({ error: 'Failed to fetch overdue detail' }, { status: 500 });
  }
}
