import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';
import { getPgClient } from '@/lib/pg';

// GET /api/reports/recovery-summary?date=xxx
export async function GET(request: NextRequest) {
  let client;
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');

    const pkOffset = 5 * 60; // Pakistan is UTC+5
    const today = new Date();

    let startDate: Date;
    let endDate: Date;
    let displayDate: string;

    if (dateStr) {
      displayDate = dateStr;
      // Use the full UTC day for filtering (Neon stores timestamps in UTC)
      const [year, month, day] = dateStr.split('-').map(Number);
      startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    } else {
      // Use current date in UTC for filtering
      const year = today.getUTCFullYear();
      const month = today.getUTCMonth();
      const day = today.getUTCDate();
      startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
      displayDate = `${String(year)}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    client = getPgClient();
    await client.connect();

    const result = await generateReport(client, startDate, endDate, displayDate);
    await client.end();
    return NextResponse.json(result);
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error generating recovery summary:', error);
    return NextResponse.json({ error: 'Failed to generate recovery summary' }, { status: 500 });
  }
}

async function generateReport(client: pg.Client, startDate: Date, endDate: Date, displayDate: string) {
  // Get all active orderbookers
  const obRes = await client.query(
    'SELECT id, name, phone FROM "User" WHERE role = \'orderbooker\' AND status = \'active\' ORDER BY name ASC'
  );
  const orderbookers = obRes.rows;

  const recoverySummary = await Promise.all(
    orderbookers.map(async (ob) => {
      // Get shops for this orderbooker
      const shopRes = await client.query(
        'SELECT id, name, area, balance FROM "Shop" WHERE "orderbookerId" = $1 AND status = \'active\' ORDER BY name ASC',
        [ob.id]
      );
      const shops = shopRes.rows;

      const shopRecoveries = await Promise.all(
        shops.map(async (shop) => {
          const txnRes = await client.query(
            `SELECT id, type, amount, "previousBalance", "newBalance", "createdAt", description, "gpsLat", "gpsLng"
             FROM "Transaction"
             WHERE "shopId" = $1 AND "createdAt" >= $2 AND "createdAt" <= $3 AND status = 'approved'
             ORDER BY "createdAt" DESC`,
            [shop.id, startDate.toISOString(), endDate.toISOString()]
          );
          const dayTxns = txnRes.rows;

          const todayCredit = dayTxns.filter((t: { type: string; amount: number }) => t.type === 'credit').reduce((s: number, t: { amount: number }) => s + t.amount, 0);
          const recoveryTxns = dayTxns.filter((t: { type: string }) => t.type === 'recovery');
          const todayRecovery = recoveryTxns.reduce((s: number, t: { amount: number }) => s + t.amount, 0);
          const prevBalance = dayTxns.length > 0 ? dayTxns[dayTxns.length - 1].previousBalance : shop.balance;

          const recoveryEntries = recoveryTxns.map((t: { id: string; amount: number; createdAt: string; description: string | null; gpsLat: number | null; gpsLng: number | null }) => ({
            id: t.id,
            amount: Math.round(t.amount * 100) / 100,
            time: t.createdAt,
            description: t.description,
            hasGps: !!(t.gpsLat && t.gpsLng),
            gpsLat: t.gpsLat,
            gpsLng: t.gpsLng,
          }));

          return {
            shopId: shop.id,
            shopName: shop.name,
            shopArea: shop.area,
            previousBalance: Math.round(prevBalance * 100) / 100,
            todayCredit: Math.round(todayCredit * 100) / 100,
            todayRecovery: Math.round(todayRecovery * 100) / 100,
            closingBalance: Math.round((prevBalance + todayCredit - todayRecovery) * 100) / 100,
            visited: recoveryTxns.length > 0,
            recoveryEntries,
          };
        })
      );

      const totalRecovery = shopRecoveries.reduce((s: number, shop: { todayRecovery: number }) => s + shop.todayRecovery, 0);
      const visitedShops = shopRecoveries.filter((s: { visited: boolean }) => s.visited).length;

      return {
        orderbookerId: ob.id,
        orderbookerName: ob.name,
        orderbookerPhone: ob.phone,
        totalRecovery: Math.round(totalRecovery * 100) / 100,
        totalShops: shops.length,
        visitedShops,
        shops: shopRecoveries,
      };
    })
  );

  const grandTotalRecovery = recoverySummary.reduce((s: number, ob: { totalRecovery: number }) => s + ob.totalRecovery, 0);

  return {
    date: displayDate,
    grandTotalRecovery: Math.round(grandTotalRecovery * 100) / 100,
    orderbookers: recoverySummary,
  };
}
