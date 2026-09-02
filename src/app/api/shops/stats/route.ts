import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/shops/stats
// Lightweight aggregate for the Shop Management page:
// route-day counts + summary analytics — WITHOUT shipping the full 700+ shop
// list. Previously the page fetched the FULL shop list a second time
// (fetchAllShopsForCounts) just to compute these numbers client-side.
//
// Response (~200 bytes):
// {
//   counts: { monday: 45, ... },          // route-day counts (ACTIVE shops)
//   totalActive: 612, totalInactive: 95,
//   totalOutstanding: 1234567.5,           // sum of balance, ACTIVE shops
//   averageBalance: 2017.2,                // ACTIVE shops
//   highestBalanceShop: { name, balance } | null,
//   topArea: { name, count } | null        // ACTIVE shops
// }
export async function GET(request: NextRequest) {
  try {
    // Fetch only the small fields needed for aggregation. 700 rows of
    // 5 scalar/array fields is trivial server-side; the win is that none of
    // it crosses the network to the browser.
    const shops = await db.shop.findMany({
      select: {
        name: true,
        area: true,
        balance: true,
        status: true,
        routeDays: true,
      },
    });

    const counts: Record<string, number> = {};
    const areaCounts: Record<string, number> = {};
    let totalActive = 0;
    let totalInactive = 0;
    let totalOutstanding = 0;
    let highestBalanceShop: { name: string; balance: number } | null = null;
    let highestBalance = -Infinity;

    for (const s of shops) {
      if (s.status === 'active') {
        totalActive++;
        totalOutstanding += Number(s.balance);
        for (const day of s.routeDays) {
          counts[day] = (counts[day] || 0) + 1;
        }
        const area = s.area || 'Unknown';
        areaCounts[area] = (areaCounts[area] || 0) + 1;
        const bal = Number(s.balance);
        if (bal > highestBalance) {
          highestBalance = bal;
          highestBalanceShop = { name: s.name, balance: bal };
        }
      } else {
        totalInactive++;
      }
    }

    const topAreaEntry = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0] || null;

    return NextResponse.json(
      {
        counts,
        totalActive,
        totalInactive,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        averageBalance: totalActive > 0 ? Math.round((totalOutstanding / totalActive) * 100) / 100 : 0,
        highestBalanceShop,
        topArea: topAreaEntry ? { name: topAreaEntry[0], count: topAreaEntry[1] } : null,
      },
      {
        // Stats go stale the moment any shop is edited — but the client cache
        // layer revalidates on mount/refresh anyway, so a tiny browser-side
        // cache is safe and saves repeat calls.
        headers: { 'Cache-Control': 'private, max-age=30' },
      }
    );
  } catch (error) {
    console.error('Error computing shop stats:', error);
    return NextResponse.json({ error: 'Failed to compute shop stats' }, { status: 500 });
  }
}
