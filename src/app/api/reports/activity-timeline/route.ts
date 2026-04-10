import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

    // Fetch transactions (credit + recovery)
    if (type === 'all' || type === 'credit' || type === 'recovery') {
      const transactionWhere: Record<string, unknown> = {};
      if (type === 'credit') transactionWhere.type = 'credit';
      if (type === 'recovery') transactionWhere.type = 'recovery';

      const transactions = await db.transaction.findMany({
        where: transactionWhere,
        orderBy: { createdAt: 'desc' },
        take: type === 'all' ? limit + offset : Math.ceil((limit + offset) * 0.6),
        include: {
          shop: {
            select: { id: true, name: true, area: true },
          },
          creator: {
            select: { id: true, name: true, role: true },
          },
        },
      });

      for (const txn of transactions) {
        const txType = txn.type as 'credit' | 'recovery';
        const verb = txType === 'credit' ? 'Posted' : 'Recovered';
        const description = txn.description
          ? txn.description
          : `${verb} Rs. ${txn.amount.toLocaleString('en-PK')} ${txType === 'credit' ? 'credit to' : 'from'} ${txn.shop.name}`;

        activities.push({
          id: txn.id,
          type: txType,
          description,
          shopName: txn.shop.name,
          shopArea: txn.shop.area,
          performedBy: txn.creator.name,
          amount: txn.amount,
          createdAt: txn.createdAt.toISOString(),
          timeAgo: getTimeAgo(txn.createdAt),
        });

        if (txType === 'credit') creditCount++;
        else recoveryCount++;
      }
    }

    // Fetch audit log edits
    if (type === 'all' || type === 'edit') {
      const editLogs = await db.auditLog.findMany({
        where: {
          action: 'edit',
        },
        orderBy: { createdAt: 'desc' },
        take: type === 'all' ? limit + offset : Math.ceil((limit + offset) * 0.6),
        include: {
          performer: {
            select: { id: true, name: true, role: true },
          },
        },
      });

      for (const log of editLogs) {
        let shopName: string | null = null;
        let shopArea: string | null = null;

        // Try to extract shop name from description or entity
        if (log.entityType === 'shop' && log.entityId) {
          try {
            const shop = await db.shop.findUnique({
              where: { id: log.entityId },
              select: { name: true, area: true },
            });
            if (shop) {
              shopName = shop.name;
              shopArea = shop.area;
            }
          } catch {
            // Skip if shop not found
          }
        }

        activities.push({
          id: log.id,
          type: 'edit',
          description: log.description || `Edited ${log.entityType || 'record'}`,
          shopName,
          shopArea,
          performedBy: log.performer?.name || 'System',
          amount: null,
          createdAt: log.createdAt.toISOString(),
          timeAgo: getTimeAgo(log.createdAt),
        });

        editCount++;
      }
    }

    // If fetching 'all', also get counts for types we might not have fully loaded
    if (type === 'all') {
      const [totalCredits, totalRecoveries, totalEdits] = await Promise.all([
        db.transaction.count({ where: { type: 'credit' } }),
        db.transaction.count({ where: { type: 'recovery' } }),
        db.auditLog.count({ where: { action: 'edit' } }),
      ]);
      creditCount = totalCredits;
      recoveryCount = totalRecoveries;
      editCount = totalEdits;
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
