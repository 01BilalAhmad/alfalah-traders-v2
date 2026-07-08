import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/visits/recent - Get recent visit activity combining ShopVisit + Transaction data
// Query params: date (YYYY-MM-DD), orderbookerId, limit (default 100), source (all|gps|transaction)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date'); // YYYY-MM-DD
    const orderbookerId = searchParams.get('orderbookerId');
    const limit = parseInt(searchParams.get('limit') || '100');
    const source = searchParams.get('source') || 'all'; // all, gps, transaction

    // Pakistan timezone offset
    const pkOffset = 5 * 60;

    let startDate: Date;
    let endDate: Date;

    if (dateStr) {
      const [year, month, day] = dateStr.split('-').map(Number);
      startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - pkOffset * 60 * 1000);
      endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - pkOffset * 60 * 1000);
    } else {
      // Default: today in Pakistan timezone
      const now = new Date();
      const pkNow = new Date(now.getTime() + pkOffset * 60 * 1000);
      const year = pkNow.getUTCFullYear();
      const month = pkNow.getUTCMonth();
      const day = pkNow.getUTCDate();
      startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - pkOffset * 60 * 1000);
      endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - pkOffset * 60 * 1000);
    }

    const pool = getPool();

    const allVisits: any[] = [];

    // 1. Fetch ShopVisit records (GPS check-ins)
    if (source === 'all' || source === 'gps') {
      const gpsConditions: string[] = [`sv."createdAt" >= $1`, `sv."createdAt" <= $2`];
      const gpsParams: any[] = [startDate.toISOString(), endDate.toISOString()];
      let paramIdx = 3;

      if (orderbookerId) {
        gpsConditions.push(`sv."orderbookerId" = $${paramIdx++}`);
        gpsParams.push(orderbookerId);
      }

      const gpsRes = await pool.query(
        `SELECT sv.id, sv."shopId", sv."orderbookerId", sv."gpsLat", sv."gpsLng",
                sv."gpsAddress", sv."inRange", sv."createdAt",
                s.name AS "shopName", u.name AS "orderbookerName"
         FROM "ShopVisit" sv
         LEFT JOIN "Shop" s ON sv."shopId" = s.id
         LEFT JOIN "User" u ON sv."orderbookerId" = u.id
         WHERE ${gpsConditions.join(' AND ')}
         ORDER BY sv."createdAt" DESC
         LIMIT ${limit}`,
        gpsParams
      );

      gpsRes.rows.forEach((row: any) => {
        allVisits.push({
          id: row.id,
          shopId: row.shopId,
          shopName: row.shopName || 'Unknown',
          orderbookerId: row.orderbookerId,
          orderbookerName: row.orderbookerName || 'Unknown',
          gpsLat: row.gpsLat,
          gpsLng: row.gpsLng,
          gpsAddress: row.gpsAddress,
          inRange: row.inRange,
          createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
          source: 'gps',
          sourceLabel: 'GPS Check-in',
          amount: null,
          transactionType: null,
        });
      });
    }

    // 2. Fetch Transaction-based visits (recovery + credit posted = visit)
    if (source === 'all' || source === 'transaction') {
      const txConditions: string[] = [`t."createdAt" >= $1`, `t."createdAt" <= $2`, `t.status IN ('approved', 'pending')`];
      const txParams: any[] = [startDate.toISOString(), endDate.toISOString()];
      let paramIdx = 3;

      if (orderbookerId) {
        txConditions.push(`t."createdBy" = $${paramIdx++}`);
        txParams.push(orderbookerId);
      }

      const txRes = await pool.query(
        `SELECT t.id, t."shopId", t."createdBy" AS "orderbookerId",
                t.type, t.amount, t.status, t."gpsLat", t."gpsLng", t."createdAt",
                s.name AS "shopName", u.name AS "orderbookerName"
         FROM "Transaction" t
         LEFT JOIN "Shop" s ON t."shopId" = s.id
         LEFT JOIN "User" u ON t."createdBy" = u.id
         WHERE ${txConditions.join(' AND ')}
         ORDER BY t."createdAt" DESC
         LIMIT ${limit}`,
        txParams
      );

      txRes.rows.forEach((row: any) => {
        allVisits.push({
          id: row.id,
          shopId: row.shopId,
          shopName: row.shopName || 'Unknown',
          orderbookerId: row.orderbookerId,
          orderbookerName: row.orderbookerName || 'Unknown',
          gpsLat: row.gpsLat,
          gpsLng: row.gpsLng,
          gpsAddress: null, // Transactions don't store address
          inRange: !!(row.gpsLat && row.gpsLng), // Has GPS = in range
          createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
          source: 'transaction',
          sourceLabel: row.type === 'recovery' ? 'Recovery' : 'Credit',
          amount: row.amount,
          transactionType: row.type,
          transactionStatus: row.status, // Include status so admin can see pending/approved
        });
      });
    }

    // Sort all visits by createdAt descending
    allVisits.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // If both GPS and transaction exist for same shop+OB on same day, prefer GPS (deduplicate)
    const seen = new Set<string>();
    const dedupedVisits: any[] = [];

    for (const visit of allVisits) {
      // Create a key from shopId + orderbookerId + date (not time)
      const visitDate = new Date(visit.createdAt);
      const dateKey = `${visit.shopId}_${visit.orderbookerId}_${visitDate.getFullYear()}-${visitDate.getMonth()}-${visitDate.getDate()}`;

      if (visit.source === 'gps') {
        // GPS visits are always included
        if (!seen.has(dateKey + '_gps')) {
          seen.add(dateKey + '_gps');
          dedupedVisits.push(visit);
        }
      } else {
        // Transaction visits: only include if no GPS visit for same shop+OB+date
        if (!seen.has(dateKey + '_gps')) {
          if (!seen.has(dateKey + '_tx')) {
            seen.add(dateKey + '_tx');
            dedupedVisits.push(visit);
          }
        }
      }
    }

    return NextResponse.json(dedupedVisits.slice(0, limit));
  } catch (error) {
    console.error('Error fetching recent visits:', error);
    return NextResponse.json({ error: 'Failed to fetch recent visits' }, { status: 500 });
  }
}
