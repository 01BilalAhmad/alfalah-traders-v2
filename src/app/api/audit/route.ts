import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/audit?action=xxx&entityType=xxx&page=1&limit=50
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const search = searchParams.get('search');

    const pool = getPool();

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (action) {
      conditions.push(`a.action = $${paramIndex++}`);
      params.push(action);
    }
    if (entityType) {
      conditions.push(`a."entityType" = $${paramIndex++}`);
      params.push(entityType);
    }
    if (search) {
      conditions.push(`(a.description ILIKE $${paramIndex} OR a.action ILIKE $${paramIndex} OR a."entityType" ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM "AuditLog" a ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    // Fetch paginated logs
    const offset = (page - 1) * limit;
    const logsRes = await pool.query(
      `SELECT a.*, u.id AS "performer_id", u.name AS "performer_name", u.role AS "performer_role"
       FROM "AuditLog" a
       LEFT JOIN "User" u ON a."performedBy" = u.id
       ${whereClause}
       ORDER BY a."createdAt" DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    const logs = logsRes.rows.map((l: any) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      performedBy: l.performedBy,
      oldValue: l.oldValue,
      newValue: l.newValue,
      description: l.description,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
      performer: l.performer_id ? {
        id: l.performer_id,
        name: l.performer_name,
        role: l.performer_role,
      } : null,
    }));

    return NextResponse.json({
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
