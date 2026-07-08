import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// GET /api/reports/sms-tracking
// Returns SMS log entries for admin tracking.
//
// Query params:
//   - date: YYYY-MM-DD (default: today)
//   - orderbookerId: filter by specific OB (optional)
//   - status: filter by status — "sent" | "failed" | "skipped" (optional)
//   - method: filter by method — "sms" | "whatsapp" (optional)
//   - limit: max results (default 500, max 1000)
//
// Response:
//   {
//     logs: [{ id, shopId, shopName, shopPhone, orderbookerId, orderbookerName,
//              transactionId, method, status, message, errorMessage, sentAt }],
//     summary: { total, sent, failed, skipped, smsCount, whatsappCount },
//     perOB: [{ orderbookerId, orderbookerName, total, sent, failed, skipped, sms, whatsapp }]
//   }
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const orderbookerId = searchParams.get('orderbookerId');
    const statusFilter = searchParams.get('status');
    const methodFilter = searchParams.get('method');
    const limit = Math.min(parseInt(searchParams.get('limit') || '500'), 1000);

    const pool = getPool();

    // Build date range (Pakistan timezone — UTC+5)
    // If no date provided, use today
    let startDate: Date;
    let endDate: Date;

    if (dateStr) {
      const [year, month, day] = dateStr.split('-').map(Number);
      const pkOffsetMs = 5 * 60 * 60 * 1000;
      const startUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)).getTime() - pkOffsetMs;
      const endUTC = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)).getTime() - pkOffsetMs;
      startDate = new Date(startUTC);
      endDate = new Date(endUTC);
    } else {
      // Today in PKT
      const now = new Date();
      const pkOffsetMs = 5 * 60 * 60 * 1000;
      const pkNow = new Date(now.getTime() + pkOffsetMs);
      const todayStart = new Date(Date.UTC(pkNow.getUTCFullYear(), pkNow.getUTCMonth(), pkNow.getUTCDate(), 0, 0, 0, 0));
      startDate = new Date(todayStart.getTime() - pkOffsetMs);
      endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1);
    }

    // Build WHERE conditions
    const conditions: string[] = [
      `sl."sentAt" >= $1`,
      `sl."sentAt" <= $2`,
    ];
    const params: unknown[] = [startDate, endDate];
    let paramIdx = 3;

    if (orderbookerId) {
      conditions.push(`sl."orderbookerId" = $${paramIdx++}`);
      params.push(orderbookerId);
    }
    if (statusFilter) {
      conditions.push(`sl.status = $${paramIdx++}`);
      params.push(statusFilter);
    }
    if (methodFilter) {
      conditions.push(`sl.method = $${paramIdx++}`);
      params.push(methodFilter);
    }

    const whereClause = conditions.join(' AND ');

    // Fetch logs with OB name
    const logsRes = await pool.query(
      `SELECT sl.*, u.name AS "orderbookerName"
       FROM "SmsLog" sl
       LEFT JOIN "User" u ON sl."orderbookerId" = u.id
       WHERE ${whereClause}
       ORDER BY sl."sentAt" DESC
       LIMIT $${paramIdx++}`,
      [...params, limit]
    );

    const logs = logsRes.rows.map((l: any) => ({
      id: l.id,
      shopId: l.shopId,
      shopName: l.shopName,
      shopPhone: l.shopPhone,
      orderbookerId: l.orderbookerId,
      orderbookerName: l.orderbookerName || 'Unknown',
      transactionId: l.transactionId,
      method: l.method,
      status: l.status,
      message: l.message,
      errorMessage: l.errorMessage,
      sentAt: l.sentAt instanceof Date ? l.sentAt.toISOString() : l.sentAt,
    }));

    // Build summary (no filter on status/method for totals)
    const summaryConditions = [
      `sl."sentAt" >= $1`,
      `sl."sentAt" <= $2`,
    ];
    const summaryParams: unknown[] = [startDate, endDate];
    let sParamIdx = 3;

    if (orderbookerId) {
      summaryConditions.push(`sl."orderbookerId" = $${sParamIdx++}`);
      summaryParams.push(orderbookerId);
    }

    const summaryRes = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'sent') AS sent,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed,
         COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
         COUNT(*) FILTER (WHERE method = 'sms') AS "smsCount",
         COUNT(*) FILTER (WHERE method = 'whatsapp') AS "whatsappCount"
       FROM "SmsLog" sl
       WHERE ${summaryConditions.join(' AND ')}`,
      summaryParams
    );

    const summary = {
      total: parseInt(summaryRes.rows[0]?.total || '0'),
      sent: parseInt(summaryRes.rows[0]?.sent || '0'),
      failed: parseInt(summaryRes.rows[0]?.failed || '0'),
      skipped: parseInt(summaryRes.rows[0]?.skipped || '0'),
      smsCount: parseInt(summaryRes.rows[0]?.smsCount || '0'),
      whatsappCount: parseInt(summaryRes.rows[0]?.whatsappCount || '0'),
    };

    // Per-OB breakdown
    const perOBRes = await pool.query(
      `SELECT
         sl."orderbookerId",
         u.name AS "orderbookerName",
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE sl.status = 'sent') AS sent,
         COUNT(*) FILTER (WHERE sl.status = 'failed') AS failed,
         COUNT(*) FILTER (WHERE sl.status = 'skipped') AS skipped,
         COUNT(*) FILTER (WHERE sl.method = 'sms') AS sms,
         COUNT(*) FILTER (WHERE sl.method = 'whatsapp') AS whatsapp
       FROM "SmsLog" sl
       LEFT JOIN "User" u ON sl."orderbookerId" = u.id
       WHERE ${summaryConditions.join(' AND ')}
       GROUP BY sl."orderbookerId", u.name
       ORDER BY total DESC`,
      summaryParams
    );

    const perOB = perOBRes.rows.map((r: any) => ({
      orderbookerId: r.orderbookerId,
      orderbookerName: r.orderbookerName || 'Unknown',
      total: parseInt(r.total),
      sent: parseInt(r.sent),
      failed: parseInt(r.failed),
      skipped: parseInt(r.skipped),
      sms: parseInt(r.sms),
      whatsapp: parseInt(r.whatsapp),
    }));

    return NextResponse.json({ logs, summary, perOB });
  } catch (error) {
    console.error('[SmsTracking] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch SMS tracking data' }, { status: 500 });
  }
}
