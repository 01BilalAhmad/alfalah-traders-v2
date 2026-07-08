import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import type { Pool } from 'pg';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderbookerCompany {
  companyId: string;
  companyName: string;
  isPrimary: boolean;
}

interface OrderbookerData {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  status: string;
  allRoutesEnabled: boolean;
  companyId: string | null;
  companyName: string | null;
  companies: OrderbookerCompany[];
  createdAt: string;
  totalShops: number;
  totalOutstanding: number;
  totalCreditPosted: number;
  totalRecovery: number;
}

interface TransactionData {
  id: string;
  shopId: string;
  type: string;
  status: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string | null;
  createdBy: string | null;
  companyId: string | null;
  createdAt: string;
  shop: { id: string; name: string | null; area: string | null } | null;
  creator: { id: string | null; name: string | null; role: string | null } | null;
  company: { id: string; name: string | null } | null;
}

interface ShopData {
  id: string;
  name: string;
  area: string | null;
  routeDays: string[];
  balance: number;
  creditLimit: number;
  status: string;
  orderbookerId: string | null;
  orderbookerName: string | null;
}

interface DailyTrendDay {
  date: string;
  label: string;
  credit: number;
  recovery: number;
  net: number;
}

interface ActivityItem {
  id: string;
  type: 'credit' | 'recovery' | 'edit';
  description: string;
  shopName: string | null;
  shopArea: string | null;
  performedBy: string;
  amount: number | null;
  createdAt: string;
  timeAgo: string;
}

interface ActivityTimelineData {
  activities: ActivityItem[];
  counts: { all: number; credit: number; recovery: number; edit: number };
}

interface MonthSummaryData {
  month: string;
  monthLabel: string;
  totalCredit: number;
  totalRecovery: number;
  netPosition: number;
  transactionCount: number;
  creditCount: number;
  recoveryCount: number;
  topRecoveryDay: { date: string; amount: number } | null;
  topCreditDay: { date: string; amount: number } | null;
  activeDays: number;
  prevMonth: string;
  prevTotalCredit: number;
  prevTotalRecovery: number;
  prevNetPosition: number;
  creditChangePct: number;
  recoveryChangePct: number;
  netChangePct: number;
}

interface SummaryData {
  totalUsers: number;
  totalShops: number;
  totalTransactions: number;
  totalCredit: number;
  totalRecovery: number;
  netBalance: number;
}

interface DashboardResponse {
  orderbookers: OrderbookerData[];
  todayTransactions: TransactionData[];
  shops: ShopData[];
  dailyTrends: DailyTrendDay[];
  activityTimeline: ActivityTimelineData;
  monthSummary: MonthSummaryData;
  recentTransactions: TransactionData[];
  summary: SummaryData;
  smsReport?: SmsReportData;
}

interface SmsReportData {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  smsCount: number;
  whatsappCount: number;
  perOB: Array<{
    orderbookerId: string;
    orderbookerName: string;
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    sms: number;
    whatsapp: number;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get Pakistan timezone day boundaries as UTC Dates (PKT = UTC+5, no DST) */
function getPakistanDayRange(dateStr: string): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -5, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));
  return { start, end };
}

/** Get today's date string in Pakistan timezone (YYYY-MM-DD) */
function getPakistanTodayStr(): string {
  const now = new Date();
  const pktMs = now.getTime() + 5 * 60 * 60 * 1000;
  const pktNow = new Date(pktMs);
  return `${pktNow.getUTCFullYear()}-${String(pktNow.getUTCMonth() + 1).padStart(2, '0')}-${String(pktNow.getUTCDate()).padStart(2, '0')}`;
}

/** Get date string N days ago in Pakistan timezone (YYYY-MM-DD) */
function getPakistanDaysAgoStr(daysAgo: number): string {
  const now = new Date();
  const pktMs = now.getTime() + 5 * 60 * 60 * 1000;
  const pktNow = new Date(pktMs);
  pktNow.setUTCDate(pktNow.getUTCDate() - daysAgo);
  return `${pktNow.getUTCFullYear()}-${String(pktNow.getUTCMonth() + 1).padStart(2, '0')}-${String(pktNow.getUTCDate()).padStart(2, '0')}`;
}

/** Human-readable time ago string */
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

/** Percentage change between current and previous values */
function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Short weekday label like "Wed 4" from a YYYY-MM-DD string */
function getDayLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric' });
}

/** Map a raw transaction row (with joined shop/creator/company) to TransactionData */
function mapTransactionRow(t: Record<string, unknown>): TransactionData {
  return {
    id: t.id as string,
    shopId: t.shopId as string,
    type: t.type as string,
    status: t.status as string,
    amount: Number(t.amount),
    previousBalance: Number(t.previousBalance),
    newBalance: Number(t.newBalance),
    description: (t.description as string) ?? null,
    createdBy: (t.createdBy as string) ?? null,
    companyId: (t.companyId as string) ?? null,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    shop: {
      id: t.shopId as string,
      name: (t.shop_name as string) ?? null,
      area: (t.shop_area as string) ?? null,
    },
    creator: {
      id: (t.createdBy as string) ?? null,
      name: (t.creator_name as string) ?? null,
      role: (t.creator_role as string) ?? null,
    },
    company: t.companyId
      ? { id: t.companyId as string, name: (t.company_name as string) ?? null }
      : null,
  };
}

// ─── Data Fetchers (each returns empty/default on failure) ────────────────────

async function fetchOrderbookers(pool: Pool): Promise<OrderbookerData[]> {
  try {
    const [obRes, ucRes, txAggRes] = await Promise.all([
      pool.query(
        `SELECT u.id, u.username, u.name, u.phone, u.status, u."createdAt", u."allRoutesEnabled", u."companyId",
                c.name AS "companyName",
                COUNT(s.id) AS "activeShopCount",
                COALESCE(SUM(s.balance), 0) AS "totalOutstanding"
         FROM "User" u
         LEFT JOIN "Shop" s ON u.id = s."orderbookerId" AND s.status = 'active'
         LEFT JOIN "Company" c ON u."companyId" = c.id
         WHERE u.role = 'orderbooker'
         GROUP BY u.id, c.name
         ORDER BY u.name ASC`
      ),
      pool.query(
        `SELECT uc."userId", uc."companyId", uc."isPrimary", c.name AS "companyName"
         FROM "UserCompany" uc
         JOIN "Company" c ON uc."companyId" = c.id
         ORDER BY uc."isPrimary" DESC, c.name ASC`
      ),
      pool.query(
        `SELECT s."orderbookerId" AS "userId",
                COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.status = 'approved' THEN t.amount ELSE 0 END), 0) AS "totalCreditPosted",
                COALESCE(SUM(CASE WHEN t.type IN ('recovery', 'supplier_collection') AND t.status = 'approved' THEN t.amount ELSE 0 END), 0) AS "totalRecovery"
         FROM "Transaction" t
         JOIN "Shop" s ON t."shopId" = s.id
         WHERE s."orderbookerId" IS NOT NULL
           AND t.type IN ('credit', 'recovery', 'supplier_collection')
           AND t.status = 'approved'
         GROUP BY s."orderbookerId"`
      ),
    ]);

    const userCompaniesMap: Record<string, OrderbookerCompany[]> = {};
    for (const row of ucRes.rows) {
      const userId = row.userId as string;
      if (!userCompaniesMap[userId]) userCompaniesMap[userId] = [];
      userCompaniesMap[userId].push({
        companyId: row.companyId as string,
        companyName: row.companyName as string,
        isPrimary: row.isPrimary as boolean,
      });
    }

    // Build a map of userId -> { totalCreditPosted, totalRecovery } from transaction aggregation
    const txAggMap: Record<string, { totalCreditPosted: number; totalRecovery: number }> = {};
    for (const row of txAggRes.rows) {
      txAggMap[row.userId as string] = {
        totalCreditPosted: Math.round(Number(row.totalCreditPosted) * 100) / 100,
        totalRecovery: Math.round(Number(row.totalRecovery) * 100) / 100,
      };
    }

    return obRes.rows
      .map((ob: Record<string, unknown>) => {
        const txAgg = txAggMap[ob.id as string] || { totalCreditPosted: 0, totalRecovery: 0 };
        return {
          id: ob.id as string,
          username: ob.username as string,
          name: ob.name as string,
          phone: (ob.phone as string) ?? null,
          status: ob.status as string,
          allRoutesEnabled: (ob.allRoutesEnabled as boolean) ?? false,
          companyId: (ob.companyId as string) || null,
          companyName: (ob.companyName as string) || null,
          companies: userCompaniesMap[ob.id as string] || [],
          createdAt: ob.createdAt instanceof Date ? ob.createdAt.toISOString() : String(ob.createdAt),
          totalShops: parseInt(ob.activeShopCount as string, 10),
          totalOutstanding: Math.round(Number(ob.totalOutstanding) * 100) / 100,
          totalCreditPosted: txAgg.totalCreditPosted,
          totalRecovery: txAgg.totalRecovery,
        };
      })
      // Safety filter: exclude admin users who appear as orderbookers
      // Admin users (e.g., Al Falah Traders) post credit on behalf of OBs but should not
      // appear as an OB themselves on the dashboard performance chart.
      // We detect them by username convention OR by having no shops assigned in ShopOrderbooker.
      .filter((ob) => {
        const usernameLower = (ob.username || '').toLowerCase();
        const nameLower = (ob.name || '').toLowerCase();
        // Exclude common admin usernames / names
        const isAdminLike =
          usernameLower === 'admin' ||
          usernameLower.includes('alfalah') ||
          nameLower.includes('al falah') ||
          nameLower.includes('al-falah') ||
          nameLower.includes('alfalah');
        if (isAdminLike) return false;
        return true;
      });
  } catch (error) {
    console.error('[Dashboard] Error fetching orderbookers:', error);
    return [];
  }
}

async function fetchTodayTransactions(pool: Pool): Promise<TransactionData[]> {
  try {
    const todayStr = getPakistanTodayStr();
    const { start, end } = getPakistanDayRange(todayStr);

    const txnRes = await pool.query(
      `SELECT t.id, t."shopId", t.type, t.status, t.amount, t."previousBalance", t."newBalance",
              t.description, t."createdBy", t."companyId", t."createdAt",
              s.name AS "shop_name", s.area AS "shop_area",
              c.name AS "creator_name", c.role AS "creator_role",
              co.name AS "company_name"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       LEFT JOIN "User" c ON t."createdBy" = c.id
       LEFT JOIN "Company" co ON t."companyId" = co.id
       WHERE t."createdAt" >= $1 AND t."createdAt" <= $2 AND t.status = 'approved'
       ORDER BY t."createdAt" DESC
       LIMIT 500`,
      [start.toISOString(), end.toISOString()]
    );

    return txnRes.rows.map(mapTransactionRow);
  } catch (error) {
    console.error('[Dashboard] Error fetching today transactions:', error);
    return [];
  }
}

async function fetchShops(pool: Pool): Promise<ShopData[]> {
  try {
    const shopsRes = await pool.query(
      `SELECT s.id, s.name, s.area, s."routeDays", s.balance, s."creditLimit", s.status, s."orderbookerId",
              u.name AS "orderbookerName"
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       ORDER BY s.name ASC`
    );

    return shopsRes.rows.map((s: Record<string, unknown>) => {
      const rawRouteDays = s.routeDays;
      let routeDays: string[] = [];
      if (Array.isArray(rawRouteDays)) {
        routeDays = rawRouteDays as string[];
      } else if (typeof rawRouteDays === 'string' && rawRouteDays) {
        try { routeDays = JSON.parse(rawRouteDays); } catch { routeDays = []; }
      }
      return {
        id: s.id as string,
        name: s.name as string,
        area: (s.area as string) ?? null,
        routeDays,
        balance: Math.round(Number(s.balance) * 100) / 100,
        creditLimit: Number(s.creditLimit),
        status: s.status as string,
        orderbookerId: (s.orderbookerId as string) ?? null,
        orderbookerName: (s.orderbookerName as string) ?? null,
      };
    });
  } catch (error) {
    console.error('[Dashboard] Error fetching shops:', error);
    return [];
  }
}

async function fetchDailyTrends(pool: Pool): Promise<DailyTrendDay[]> {
  try {
    const todayStr = getPakistanTodayStr();
    const sixDaysAgoStr = getPakistanDaysAgoStr(6);
    const { start: rangeStart } = getPakistanDayRange(sixDaysAgoStr);
    const { end: rangeEnd } = getPakistanDayRange(todayStr);

    // OPTIMIZED: Single SQL query instead of 7 separate day-by-day loops.
    // Shift UTC timestamps by +5 hours to convert to Pakistan time, then group by date.
    const trendsRes = await pool.query(
      `SELECT (DATE("createdAt" + INTERVAL '5 hours'))::text AS day, type, SUM(amount) AS total
       FROM "Transaction"
       WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND status = 'approved'
       GROUP BY day, type
       ORDER BY day`,
      [rangeStart.toISOString(), rangeEnd.toISOString()]
    );

    // Build a map: "YYYY-MM-DD" -> { credit, recovery }
    const dayMap: Record<string, { credit: number; recovery: number }> = {};
    for (const row of trendsRes.rows) {
      const day = row.day as string;
      if (!dayMap[day]) dayMap[day] = { credit: 0, recovery: 0 };
      const total = Number(row.total);
      if (row.type === 'credit') dayMap[day].credit = total;
      if (row.type === 'recovery') dayMap[day].recovery = total;
    }

    // Fill in all 7 days (including days with zero transactions)
    const days: DailyTrendDay[] = [];
    for (let i = 6; i >= 0; i--) {
      const dateStr = getPakistanDaysAgoStr(i);
      const data = dayMap[dateStr] || { credit: 0, recovery: 0 };
      days.push({
        date: dateStr,
        label: getDayLabel(dateStr),
        credit: Math.round(data.credit * 100) / 100,
        recovery: Math.round(data.recovery * 100) / 100,
        net: Math.round((data.credit - data.recovery) * 100) / 100,
      });
    }

    return days;
  } catch (error) {
    console.error('[Dashboard] Error fetching daily trends:', error);
    return [];
  }
}

async function fetchActivityTimeline(pool: Pool): Promise<ActivityTimelineData> {
  const empty: ActivityTimelineData = {
    activities: [],
    counts: { all: 0, credit: 0, recovery: 0, edit: 0 },
  };

  try {
    const limit = 20;

    // Fetch recent transactions, recent edits, and counts — all in parallel
    const [txnRes, editRes, creditCountRes, recoveryCountRes, editCountRes] = await Promise.all([
      pool.query(
        `SELECT t.id, t.type, t.amount, t.description, t."createdAt",
                s.name AS "shop_name", s.area AS "shop_area",
                u.name AS "creator_name"
         FROM "Transaction" t
         LEFT JOIN "Shop" s ON t."shopId" = s.id
         LEFT JOIN "User" u ON t."createdBy" = u.id
         WHERE t.status = 'approved'
         ORDER BY t."createdAt" DESC
         LIMIT $1`,
        [limit]
      ),
      pool.query(
        `SELECT a.id, a.action, a."entityType", a."entityId", a.description, a."createdAt",
                u.name AS "performer_name"
         FROM "AuditLog" a
         LEFT JOIN "User" u ON a."performedBy" = u.id
         WHERE a.action = 'edit'
         ORDER BY a."createdAt" DESC
         LIMIT $1`,
        [limit]
      ),
      pool.query(
        `SELECT COUNT(*) FROM "Transaction" WHERE type = 'credit' AND status = 'approved'`
      ),
      pool.query(
        `SELECT COUNT(*) FROM "Transaction" WHERE type = 'recovery' AND status = 'approved'`
      ),
      pool.query(
        `SELECT COUNT(*) FROM "AuditLog" WHERE action = 'edit'`
      ),
    ]);

    const activities: ActivityItem[] = [];

    // Process transactions
    for (const txn of txnRes.rows) {
      const txType = txn.type as 'credit' | 'recovery';
      const verb = txType === 'credit' ? 'Posted' : 'Recovered';
      const description = txn.description
        ? String(txn.description)
        : `${verb} Rs. ${Number(txn.amount).toLocaleString('en-PK')} ${txType === 'credit' ? 'credit to' : 'from'} ${txn.shop_name || 'Unknown'}`;

      activities.push({
        id: txn.id as string,
        type: txType,
        description,
        shopName: (txn.shop_name as string) ?? null,
        shopArea: (txn.shop_area as string) ?? null,
        performedBy: (txn.creator_name as string) || 'Unknown',
        amount: Number(txn.amount),
        createdAt: txn.createdAt instanceof Date ? txn.createdAt.toISOString() : String(txn.createdAt),
        timeAgo: getTimeAgo(new Date(txn.createdAt as string | Date)),
      });
    }

    // Process edit audit logs (skip per-entity shop lookups for dashboard speed)
    for (const log of editRes.rows) {
      activities.push({
        id: log.id as string,
        type: 'edit',
        description: (log.description as string) || `Edited ${(log.entityType as string) || 'record'}`,
        shopName: null,
        shopArea: null,
        performedBy: (log.performer_name as string) || 'System',
        amount: null,
        createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
        timeAgo: getTimeAgo(new Date(log.createdAt as string | Date)),
      });
    }

    // Sort merged activities by createdAt descending and take top N
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const creditCount = parseInt(creditCountRes.rows[0].count as string, 10);
    const recoveryCount = parseInt(recoveryCountRes.rows[0].count as string, 10);
    const editCount = parseInt(editCountRes.rows[0].count as string, 10);

    return {
      activities: activities.slice(0, limit),
      counts: {
        all: creditCount + recoveryCount + editCount,
        credit: creditCount,
        recovery: recoveryCount,
        edit: editCount,
      },
    };
  } catch (error) {
    console.error('[Dashboard] Error fetching activity timeline:', error);
    return empty;
  }
}

async function fetchMonthSummary(pool: Pool): Promise<MonthSummaryData> {
  const empty: MonthSummaryData = {
    month: '',
    monthLabel: '',
    totalCredit: 0,
    totalRecovery: 0,
    netPosition: 0,
    transactionCount: 0,
    creditCount: 0,
    recoveryCount: 0,
    topRecoveryDay: null,
    topCreditDay: null,
    activeDays: 0,
    prevMonth: '',
    prevTotalCredit: 0,
    prevTotalRecovery: 0,
    prevNetPosition: 0,
    creditChangePct: 0,
    recoveryChangePct: 0,
    netChangePct: 0,
  };

  try {
    // Determine current month in Pakistan timezone
    const now = new Date();
    const pktMs = now.getTime() + 5 * 60 * 60 * 1000;
    const pktNow = new Date(pktMs);
    const year = pktNow.getUTCFullYear();
    const month = pktNow.getUTCMonth() + 1;

    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    // Current month boundaries in UTC (offset by -5h for PKT start/end)
    const startDate = new Date(Date.UTC(year, month - 1, 1, -5, 0, 0, 0));
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = new Date(Date.UTC(year, month - 1, lastDay, 18, 59, 59, 999));

    // Previous month boundaries
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const prevStartDate = new Date(Date.UTC(prevYear, prevMonth - 1, 1, -5, 0, 0, 0));
    const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
    const prevEndDate = new Date(Date.UTC(prevYear, prevMonth - 1, prevLastDay, 18, 59, 59, 999));

    // Fetch current and previous month data in parallel
    const [monthRes, prevRes] = await Promise.all([
      pool.query(
        `SELECT type, amount, "createdAt" FROM "Transaction"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND status = 'approved'`,
        [startDate.toISOString(), endDate.toISOString()]
      ),
      pool.query(
        `SELECT type, amount FROM "Transaction"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND status = 'approved'`,
        [prevStartDate.toISOString(), prevEndDate.toISOString()]
      ),
    ]);

    const monthTxns: Array<{ type: string; amount: number; createdAt: string | Date }> =
      monthRes.rows as Array<{ type: string; amount: number; createdAt: string | Date }>;
    const prevTxns: Array<{ type: string; amount: number }> =
      prevRes.rows as Array<{ type: string; amount: number }>;

    // Current month aggregates
    const totalCredit = monthTxns
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const totalRecovery = monthTxns
      .filter((t) => t.type === 'recovery')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const netPosition = totalRecovery - totalCredit;
    const transactionCount = monthTxns.length;
    const creditCount = monthTxns.filter((t) => t.type === 'credit').length;
    const recoveryCount = monthTxns.filter((t) => t.type === 'recovery').length;

    // Top recovery and credit days
    const recoveryByDay: Record<string, number> = {};
    const creditByDay: Record<string, number> = {};
    monthTxns.forEach((t) => {
      const dayKey = new Date(t.createdAt).toISOString().split('T')[0];
      if (t.type === 'recovery') {
        recoveryByDay[dayKey] = (recoveryByDay[dayKey] || 0) + Number(t.amount);
      } else if (t.type === 'credit') {
        creditByDay[dayKey] = (creditByDay[dayKey] || 0) + Number(t.amount);
      }
    });

    let topRecoveryDay: { date: string; amount: number } | null = null;
    for (const [date, amount] of Object.entries(recoveryByDay)) {
      if (!topRecoveryDay || amount > topRecoveryDay.amount) {
        topRecoveryDay = { date, amount };
      }
    }

    let topCreditDay: { date: string; amount: number } | null = null;
    for (const [date, amount] of Object.entries(creditByDay)) {
      if (!topCreditDay || amount > topCreditDay.amount) {
        topCreditDay = { date, amount };
      }
    }

    // Previous month aggregates
    const prevTotalCredit = prevTxns
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const prevTotalRecovery = prevTxns
      .filter((t) => t.type === 'recovery')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const prevNetPosition = prevTotalRecovery - prevTotalCredit;

    return {
      month: monthStr,
      monthLabel,
      totalCredit: Math.round(totalCredit * 100) / 100,
      totalRecovery: Math.round(totalRecovery * 100) / 100,
      netPosition: Math.round(netPosition * 100) / 100,
      transactionCount,
      creditCount,
      recoveryCount,
      topRecoveryDay: topRecoveryDay
        ? { date: topRecoveryDay.date, amount: Math.round(topRecoveryDay.amount * 100) / 100 }
        : null,
      topCreditDay: topCreditDay
        ? { date: topCreditDay.date, amount: Math.round(topCreditDay.amount * 100) / 100 }
        : null,
      activeDays: Object.keys({ ...recoveryByDay, ...creditByDay }).length,
      prevMonth: `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
      prevTotalCredit: Math.round(prevTotalCredit * 100) / 100,
      prevTotalRecovery: Math.round(prevTotalRecovery * 100) / 100,
      prevNetPosition: Math.round(prevNetPosition * 100) / 100,
      creditChangePct: pctChange(totalCredit, prevTotalCredit),
      recoveryChangePct: pctChange(totalRecovery, prevTotalRecovery),
      netChangePct: pctChange(netPosition, prevNetPosition),
    };
  } catch (error) {
    console.error('[Dashboard] Error fetching month summary:', error);
    return empty;
  }
}

async function fetchRecentTransactions(pool: Pool): Promise<TransactionData[]> {
  try {
    const txnRes = await pool.query(
      `SELECT t.id, t."shopId", t.type, t.status, t.amount, t."previousBalance", t."newBalance",
              t.description, t."createdBy", t."companyId", t."createdAt",
              s.name AS "shop_name", s.area AS "shop_area",
              c.name AS "creator_name", c.role AS "creator_role",
              co.name AS "company_name"
       FROM "Transaction" t
       LEFT JOIN "Shop" s ON t."shopId" = s.id
       LEFT JOIN "User" c ON t."createdBy" = c.id
       LEFT JOIN "Company" co ON t."companyId" = co.id
       WHERE t.status = 'approved'
       ORDER BY t."createdAt" DESC
       LIMIT 5`
    );

    return txnRes.rows.map(mapTransactionRow);
  } catch (error) {
    console.error('[Dashboard] Error fetching recent transactions:', error);
    return [];
  }
}

async function fetchSummary(pool: Pool): Promise<SummaryData> {
  const empty: SummaryData = {
    totalUsers: 0,
    totalShops: 0,
    totalTransactions: 0,
    totalCredit: 0,
    totalRecovery: 0,
    netBalance: 0,
  };

  try {
    const [
      totalUsersRes,
      totalShopsRes,
      totalTransactionsRes,
      creditAggRes,
      recoveryAggRes,
      netBalanceAggRes,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM "User"'),
      pool.query('SELECT COUNT(*) FROM "Shop"'),
      pool.query('SELECT COUNT(*) FROM "Transaction"'),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM "Transaction" WHERE type = 'credit' AND status = 'approved'`
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM "Transaction" WHERE type = 'recovery' AND status = 'approved'`
      ),
      pool.query(
        `SELECT COALESCE(SUM(balance), 0) AS total FROM "Shop"`
      ),
    ]);

    return {
      totalUsers: parseInt(totalUsersRes.rows[0].count as string, 10),
      totalShops: parseInt(totalShopsRes.rows[0].count as string, 10),
      totalTransactions: parseInt(totalTransactionsRes.rows[0].count as string, 10),
      totalCredit: Number(creditAggRes.rows[0].total),
      totalRecovery: Number(recoveryAggRes.rows[0].total),
      netBalance: Number(netBalanceAggRes.rows[0].total),
    };
  } catch (error) {
    console.error('[Dashboard] Error fetching summary:', error);
    return empty;
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const pool = getPool();

    // All 8 sections are independent — run them in parallel for maximum speed.
    // Each fetcher handles its own errors and returns empty/default data on failure,
    // so one failing query won't take down the entire dashboard.
    const [
      orderbookers,
      todayTransactions,
      shops,
      dailyTrends,
      activityTimeline,
      monthSummary,
      recentTransactions,
      summary,
    ] = await Promise.all([
      fetchOrderbookers(pool),
      fetchTodayTransactions(pool),
      fetchShops(pool),
      fetchDailyTrends(pool),
      fetchActivityTimeline(pool),
      fetchMonthSummary(pool),
      fetchRecentTransactions(pool),
      fetchSummary(pool),
    ]);

    const response: DashboardResponse = {
      orderbookers,
      todayTransactions,
      shops,
      dailyTrends,
      activityTimeline,
      monthSummary,
      recentTransactions,
      summary,
    };

    // Fetch SMS report (non-blocking — if it fails, dashboard still works)
    try {
      const smsReport = await fetchSmsReport(pool);
      response.smsReport = smsReport;
    } catch (smsErr) {
      console.warn('[Dashboard] SMS report fetch failed (non-blocking):', smsErr);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Dashboard] Fatal error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 });
  }
}

// ─── SMS Report (for dashboard summary) ─────────────────────────────────────
async function fetchSmsReport(pool: Pool): Promise<SmsReportData> {
  // Get today's Pakistan day range
  const now = new Date();
  const pkOffsetMs = 5 * 60 * 60 * 1000;
  const pkNow = new Date(now.getTime() + pkOffsetMs);
  const todayStart = new Date(Date.UTC(pkNow.getUTCFullYear(), pkNow.getUTCMonth(), pkNow.getUTCDate(), 0, 0, 0, 0));
  const startDate = new Date(todayStart.getTime() - pkOffsetMs);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1);

  // Summary counts
  const summaryRes = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'sent') AS sent,
       COUNT(*) FILTER (WHERE status = 'failed') AS failed,
       COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
       COUNT(*) FILTER (WHERE method = 'sms') AS "smsCount",
       COUNT(*) FILTER (WHERE method = 'whatsapp') AS "whatsappCount"
     FROM "SmsLog"
     WHERE "sentAt" >= $1 AND "sentAt" <= $2`,
    [startDate, endDate]
  );

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
     WHERE sl."sentAt" >= $1 AND sl."sentAt" <= $2
     GROUP BY sl."orderbookerId", u.name
     ORDER BY total DESC`,
    [startDate, endDate]
  );

  return {
    total: parseInt(summaryRes.rows[0]?.total || '0'),
    sent: parseInt(summaryRes.rows[0]?.sent || '0'),
    failed: parseInt(summaryRes.rows[0]?.failed || '0'),
    skipped: parseInt(summaryRes.rows[0]?.skipped || '0'),
    smsCount: parseInt(summaryRes.rows[0]?.smsCount || '0'),
    whatsappCount: parseInt(summaryRes.rows[0]?.whatsappCount || '0'),
    perOB: perOBRes.rows.map((r: any) => ({
      orderbookerId: r.orderbookerId,
      orderbookerName: r.orderbookerName || 'Unknown',
      total: parseInt(r.total),
      sent: parseInt(r.sent),
      failed: parseInt(r.failed),
      skipped: parseInt(r.skipped),
      sms: parseInt(r.sms),
      whatsapp: parseInt(r.whatsapp),
    })),
  };
}
