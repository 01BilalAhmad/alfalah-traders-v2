import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return date.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

// GET /api/reports/activity-timeline?limit=50&offset=0&type=all
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const type = searchParams.get('type') || 'all'; // all, credit, recovery, edit

    const activities: Array<{
      id: string;
      type: 'credit' | 'recovery' | 'edit';
      description: string;
      shopName: string | null;
      shopArea: string | null;
      performedBy: string;
      amount: number | null;
      createdAt: string;
      timeAgo: string;
    }> = [];

    // Build counts for badge info
    let creditCount = 0;
    let recoveryCount = 0;
    let editCount = 0;

    const pool = getPool();

    // Fetch transactions (credit + recovery)
    if (type === 'all' || type === 'credit' || type === 'recovery') {
      let txnQuery = `SELECT t.id, t.type, t.amount, t.description, t."createdAt",
                             s.name AS "shop_name", s.area AS "shop_area",
                             u.name AS "creator_name"
                      FROM "Transaction" t
                      LEFT JOIN "Shop" s ON t."shopId" = s.id
                      LEFT JOIN "User" u ON t."createdBy" = u.id`;
      const txnParams: any[] = [];

      if (type === 'credit') {
        txnQuery += ` WHERE t.type = $1 AND t.status = 'approved'`;
        txnParams.push('credit');
      } else if (type === 'recovery') {
        txnQuery += ` WHERE t.type = $1 AND t.status = 'approved'`;
        txnParams.push('recovery');
      } else {
        // type === 'all': filter to approved only
        txnQuery += ` WHERE t.status = 'approved'`;
      }

      const fetchLimit = type === 'all' ? limit + offset : Math.ceil((limit + offset) * 0.6);
      txnQuery += ` ORDER BY t."createdAt" DESC LIMIT $${txnParams.length + 1}`;
      txnParams.push(fetchLimit);

      const txnRes = await pool.query(txnQuery, txnParams);
      const transactions: any[] = txnRes.rows;

      for (const txn of transactions) {
        const txType = txn.type as 'credit' | 'recovery';
        const verb = txType === 'credit' ? 'Posted' : 'Recovered';
        const description = txn.description
          ? txn.description
          : `${verb} Rs. ${Number(txn.amount).toLocaleString('en-PK')} ${txType === 'credit' ? 'credit to' : 'from'} ${txn.shop_name || 'Unknown'}`;

        activities.push({
          id: txn.id,
          type: txType,
          description,
          shopName: txn.shop_name,
          shopArea: txn.shop_area,
          performedBy: txn.creator_name || 'Unknown',
          amount: Number(txn.amount),
          createdAt: txn.createdAt instanceof Date ? txn.createdAt.toISOString() : txn.createdAt,
          timeAgo: getTimeAgo(new Date(txn.createdAt)),
        });

        if (txType === 'credit') creditCount++;
        else recoveryCount++;
      }
    }

    // Fetch audit log edits
    if (type === 'all' || type === 'edit') {
      const editLimit = type === 'all' ? limit + offset : Math.ceil((limit + offset) * 0.6);
      const editRes = await pool.query(
        `SELECT a.id, a.action, a."entityType", a."entityId", a.description, a."createdAt",
                u.id AS "performer_id", u.name AS "performer_name", u.role AS "performer_role"
         FROM "AuditLog" a
         LEFT JOIN "User" u ON a."performedBy" = u.id
         WHERE a.action = 'edit'
         ORDER BY a."createdAt" DESC
         LIMIT $1`,
        [editLimit]
      );
      const editLogs: any[] = editRes.rows;

      // Pre-fetch all shop names/areas referenced by shop-type edits in ONE query (avoids N+1)
      const shopIdsToFetch = Array.from(new Set(
        editLogs
          .filter((log: any) => log.entityType === 'shop' && log.entityId)
          .map((log: any) => String(log.entityId))
      ));
      const shopInfoMap: Record<string, { name: string | null; area: string | null }> = {};
      if (shopIdsToFetch.length > 0) {
        try {
          const shopBatchRes = await pool.query(
            `SELECT id, name, area FROM "Shop" WHERE id = ANY($1::text[])`,
            [shopIdsToFetch]
          );
          for (const row of shopBatchRes.rows) {
            shopInfoMap[row.id] = { name: row.name, area: row.area };
          }
        } catch {
          // Non-blocking — shopInfoMap stays empty
        }
      }

      for (const log of editLogs) {
        let shopName: string | null = null;
        let shopArea: string | null = null;

        // Look up pre-fetched shop info (no per-iteration query)
        if (log.entityType === 'shop' && log.entityId) {
          const info = shopInfoMap[String(log.entityId)];
          if (info) {
            shopName = info.name;
            shopArea = info.area;
          }
        }

        activities.push({
          id: log.id,
          type: 'edit',
          description: log.description || `Edited ${log.entityType || 'record'}`,
          shopName,
          shopArea,
          performedBy: log.performer_name || 'System',
          amount: null,
          createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
          timeAgo: getTimeAgo(new Date(log.createdAt)),
        });

        editCount++;
      }
    }

    // If fetching 'all', also get counts for types we might not have fully loaded
    if (type === 'all') {
      const [creditCountRes, recoveryCountRes, editCountRes] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM "Transaction" WHERE type = \'credit\' AND status = \'approved\''),
        pool.query('SELECT COUNT(*) FROM "Transaction" WHERE type = \'recovery\' AND status = \'approved\''),
        pool.query('SELECT COUNT(*) FROM "AuditLog" WHERE action = \'edit\''),
      ]);
      creditCount = parseInt(creditCountRes.rows[0].count, 10);
      recoveryCount = parseInt(recoveryCountRes.rows[0].count, 10);
      editCount = parseInt(editCountRes.rows[0].count, 10);
    }

    // Merge and sort by createdAt descending
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination
    const totalCount = activities.length;
    const paginatedActivities = activities.slice(offset, offset + limit);

    return NextResponse.json({
      activities: paginatedActivities,
      counts: {
        all: creditCount + recoveryCount + editCount,
        credit: creditCount,
        recovery: recoveryCount,
        edit: editCount,
      },
      total: totalCount,
      hasMore: offset + limit < totalCount,
    });
  } catch (error) {
    console.error('Error fetching activity timeline:', error);
    return NextResponse.json({ error: 'Failed to fetch activity timeline' }, { status: 500 });
  }
}
