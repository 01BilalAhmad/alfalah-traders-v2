import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { ensureTallyTables } from '@/lib/tally-migrations';

// GET /api/notifications
// Returns notifications for the current user (matched by userId OR role).
// Unread first, then by recency.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const pool = getPool();
    await ensureTallyTables();

    const { searchParams } = new URL(request.url);
    const onlyUnread = searchParams.get('unread') === 'true';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);

    const conditions: string[] = [
      `("userId" = $1 OR "role" = $2)`,
    ];
    const params: any[] = [auth.userId, auth.user?.role];
    let idx = 3;
    if (onlyUnread) {
      conditions.push(`"read" = false`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const res = await pool.query(
      `SELECT id, "userId", role, type, title, description, meta, read, "readAt",
              "actionRoute", "createdAt"
       FROM "Notification"
       ${whereClause}
       ORDER BY read ASC, "createdAt" DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    const notifications = res.rows.map((r: any) => ({
      id: r.id,
      userId: r.userId,
      role: r.role,
      type: r.type,
      title: r.title,
      description: r.description,
      meta: r.meta,
      read: Boolean(r.read),
      readAt: r.readAt instanceof Date ? r.readAt.toISOString() : r.readAt,
      actionRoute: r.actionRoute,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));

    const unreadCount = notifications.filter((n: any) => !n.read).length;

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error('[Notifications API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// PATCH /api/notifications — mark single (by id) or all as read
// Body: { id?: string, markAll?: boolean }
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const { id, markAll } = body;

    const pool = getPool();
    await ensureTallyTables();

    if (markAll) {
      await pool.query(
        `UPDATE "Notification"
            SET read = true, "readAt" = NOW()
          WHERE ("userId" = $1 OR "role" = $2) AND read = false`,
        [auth.userId, auth.user?.role]
      );
      return NextResponse.json({ success: true, markedAll: true });
    }

    if (id) {
      await pool.query(
        `UPDATE "Notification"
            SET read = true, "readAt" = NOW()
          WHERE id = $1
            AND ("userId" = $2 OR "role" = $3)`,
        [id, auth.userId, auth.user?.role]
      );
      return NextResponse.json({ success: true, id });
    }

    return NextResponse.json({ error: 'Provide id or markAll=true' }, { status: 400 });
  } catch (error) {
    console.error('[Notifications API] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
