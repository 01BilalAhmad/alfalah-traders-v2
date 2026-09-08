import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';
import { getPool } from '@/lib/pg';

// GET /api/reports/recovery-summary?date=xxx&companyId=yyy
//
// FIX (multi-company recovery attribution):
//   Previously the per-shop companyBreakdown was built ONLY from ShopCompanyBalance
//   rows. If a recovery Transaction carried a companyId that had no matching
//   ShopCompanyBalance row for that shop (or a NULL companyId), the payment was
//   attributed to NO company — and the OB Recovery Report UI drops shops whose
//   companyBreakdown has no company with recovery/credit > 0. Result: real,
//   approved payments completely vanished from the report (e.g. Jallandher
//   Sweets with dedicated Noms + CBL shops — only one payment showed).
//
//   Now every transaction is attributed to a company using resolveTxnCompany():
//     1. txn.companyId — EXCEPT when the shop has exactly ONE company in
//        ShopCompanyBalance (a company-dedicated shop) and the txn's company
//        differs → the shop's company wins. (The mobile app falls back to the
//        orderbooker's PRIMARY company when no company is selected, which
//        mislabels payments on shops dedicated to another company.)
//     2. NULL companyId → the shop's sole ShopCompanyBalance company, else the
//        ShopOrderbooker assignment company, else '_none_' (General).
//   The breakdown is the UNION of ShopCompanyBalance companies and attributed
//   txn companies, so no approved payment can disappear from the report.
//
// FIX (date boundaries): the report now uses the Pakistan (PKT, UTC+5) calendar
//   day — same convention as /api/transactions, /api/recoveries (update-date)
//   and the teller sync routes. Previously the raw UTC day was used, which
//   pushed recoveries collected between PKT 00:00–04:59 onto the previous
//   report date.
//
// FIX (duplicate shop rows): a shop assigned to the same orderbooker through
//   multiple ShopOrderbooker company rows used to be processed once per row —
//   duplicating it in the report. Shops are now deduped by id.
//
// OWN-recovery attribution (preserved from earlier fix): a shop can have BOTH a
//   primary and a secondary orderbooker. Each OB's report shows only the
//   recoveries HE personally took ("createdBy"), while balance math uses ALL
//   recoveries taken at the shop that day.

const GENERAL_COMPANY_ID = '_none_';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Convert a date string (YYYY-MM-DD) to Pakistan timezone day boundaries.
// PKT 00:00 = UTC 19:00 of the previous day; PKT 23:59 = UTC 18:59.
function getPakistanDayRange(dateStr: string): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, day, -5, 0, 0, 0)),
    end: new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999)),
  };
}

// Current Pakistan calendar date as YYYY-MM-DD
function getPakistanTodayStr(): string {
  const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return `${pkt.getUTCFullYear()}-${String(pkt.getUTCMonth() + 1).padStart(2, '0')}-${String(pkt.getUTCDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const companyId = searchParams.get('companyId') || undefined;

    let startDate: Date;
    let endDate: Date;
    let displayDate: string;

    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      displayDate = dateStr;
      // Pakistan timezone day (Neon stores timestamps in UTC; PKT 00:00 = UTC 19:00 prev day)
      const range = getPakistanDayRange(dateStr);
      startDate = range.start;
      endDate = range.end;
    } else {
      // Use current date in Pakistan for filtering
      displayDate = getPakistanTodayStr();
      const range = getPakistanDayRange(displayDate);
      startDate = range.start;
      endDate = range.end;
    }

    const pool = getPool();
    const result = await generateReport(pool, startDate, endDate, displayDate, companyId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating recovery summary:', error);
    return NextResponse.json({ error: 'Failed to generate recovery summary' }, { status: 500 });
  }
}

interface ShopCompanyBreakdown {
  companyId: string;
  companyName: string;
  previousBalance: number;
  todayCredit: number;
  todayRecovery: number;
  closingBalance: number;
}

interface ShopRecovery {
  shopId: string;
  shopName: string;
  shopArea: string | null;
  shopAddress: string | null;
  companyId: string | null;
  previousBalance: number;
  todayCredit: number;
  todayRecovery: number;
  closingBalance: number;
  visited: boolean;
  companyBreakdown: ShopCompanyBreakdown[];
  recoveryEntries: Array<{
    id: string;
    amount: number;
    time: string;
    description: string | null;
    hasGps: boolean;
    gpsLat: number | null;
    gpsLng: number | null;
  }>;
}

interface CompanyBreakdown {
  companyId: string;
  companyName: string;
  totalRecovery: number;
  shops: number;
}

interface ShopRow {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  balance: number;
  companyId: string | null;
  isSecondary: boolean;
}

interface TxnRow {
  id: string;
  type: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  createdAt: Date | string;
  description: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  companyId: string | null;
  createdBy: string;
}

/**
 * Resolve which company a transaction belongs to for REPORT display.
 *
 * Rules (in order):
 *  1. txn.companyId set:
 *     - If the shop has exactly ONE ShopCompanyBalance company (company-dedicated
 *       shop) and the txn company differs → use the shop's company. This repairs
 *       payments that the mobile app labeled with the orderbooker's PRIMARY
 *       company (its fallback when no company is selected) even though the shop
 *       is dedicated to another company.
 *     - Otherwise → txn.companyId.
 *  2. txn.companyId NULL:
 *     - Shop's sole ShopCompanyBalance company, if exactly one.
 *     - Shop's ShopOrderbooker assignment company, if the shop has no SCB rows.
 *     - Otherwise → '_none_' (General catch-all — always visible in the report).
 */
function resolveTxnCompany(
  txn: TxnRow,
  scbCompanyIds: string[],
  shopAssignmentCompanyId: string | null
): string {
  if (txn.companyId) {
    if (scbCompanyIds.length === 1 && scbCompanyIds[0] !== txn.companyId) {
      return scbCompanyIds[0];
    }
    return txn.companyId;
  }
  if (scbCompanyIds.length === 1) {
    return scbCompanyIds[0];
  }
  if (scbCompanyIds.length === 0 && shopAssignmentCompanyId) {
    return shopAssignmentCompanyId;
  }
  return GENERAL_COMPANY_ID;
}

async function generateReport(
  pool: pg.Pool,
  startDate: Date,
  endDate: Date,
  displayDate: string,
  companyId?: string
) {
  // Company name cache (shared across all orderbookers in this request)
  const companyNameCache = new Map<string, string>();
  async function getCompanyName(cid: string): Promise<string> {
    if (cid === GENERAL_COMPANY_ID) return 'General';
    if (companyNameCache.has(cid)) return companyNameCache.get(cid)!;
    try {
      const res = await pool.query('SELECT name FROM "Company" WHERE id = $1 LIMIT 1', [cid]);
      const name = (res.rows[0] as { name?: string } | undefined)?.name || cid;
      companyNameCache.set(cid, name);
      return name;
    } catch {
      return cid;
    }
  }

  // Get all active orderbookers
  const obRes = await pool.query(
    'SELECT id, name, phone FROM "User" WHERE role = \'orderbooker\' AND status = \'active\' ORDER BY name ASC'
  );
  const orderbookers = obRes.rows;

  const recoverySummary = await Promise.all(
    orderbookers.map(async (ob) => {
      // Get primary shops for this orderbooker
      const primaryShopRes = await pool.query(
        'SELECT id, name, area, address, balance FROM "Shop" WHERE "orderbookerId" = $1 AND status = \'active\' ORDER BY name ASC',
        [ob.id]
      );
      const primaryShops: ShopRow[] = primaryShopRes.rows.map((s: { id: string; name: string; area: string | null; address: string | null; balance: number }) => ({
        id: s.id,
        name: s.name,
        area: s.area,
        address: s.address,
        balance: Number(s.balance) || 0,
        companyId: null,
        isSecondary: false,
      }));

      // Get secondary shops for this orderbooker (via ShopOrderbooker)
      const secondaryShopRes = await pool.query(
        `SELECT s.id, s.name, s.area, s.address, s.balance, so."companyId", so."routeDays"
         FROM "ShopOrderbooker" so
         JOIN "Shop" s ON s.id = so."shopId"
         WHERE so."orderbookerId" = $1 AND s.status = 'active'
         ORDER BY s.name ASC`,
        [ob.id]
      );
      const secondaryShops: ShopRow[] = secondaryShopRes.rows.map((s: { id: string; name: string; area: string | null; address: string | null; balance: number; companyId: string }) => ({
        id: s.id,
        name: s.name,
        area: s.area,
        address: s.address,
        balance: Number(s.balance) || 0,
        companyId: s.companyId,
        isSecondary: true,
      }));

      // Merge shops, deduped by shop id.
      // (Previously keyed by `${id}_${companyId}`, which processed a shop once
      // per secondary company assignment — duplicating it in the report.)
      // Secondary entries are preferred (they carry the assignment companyId).
      const shopMap = new Map<string, ShopRow>();
      for (const s of secondaryShops) {
        if (!shopMap.has(s.id)) shopMap.set(s.id, s);
      }
      for (const s of primaryShops) {
        if (!shopMap.has(s.id)) shopMap.set(s.id, s);
      }

      const allShops = Array.from(shopMap.values());

      const shopRecoveries: ShopRecovery[] = [];

      for (const shop of allShops) {
        // Fetch ALL of the day's approved transactions (all companies, all
        // creators). Company attribution (and the optional companyId filter)
        // is applied AFTER resolution so mislabeled transactions still land on
        // the right company instead of disappearing.
        // EXCLUDE 'Balance Adjustment' entries — these are tally resolution
        // adjustments, NOT actual recoveries by orderbookers. They should
        // only appear in Company Report / Ledger, not in OB Recovery Report.
        // "createdBy" is selected so recoveries can be attributed to the OB
        // who actually took them (see own-recovery filtering below).
        const txnRes = await pool.query(
          `SELECT id, type, amount, "previousBalance", "newBalance", "createdAt", description, "gpsLat", "gpsLng", "companyId", "createdBy"
           FROM "Transaction"
           WHERE "shopId" = $1 AND "createdAt" >= $2 AND "createdAt" <= $3 AND status = 'approved'
           AND (description IS NULL OR description NOT LIKE '%Balance Adjustment%')
           ORDER BY "createdAt" DESC`,
          [shop.id, startDate.toISOString(), endDate.toISOString()]
        );
        const dayTxns: TxnRow[] = txnRes.rows.map((t: any) => ({
          id: t.id,
          type: t.type,
          amount: Number(t.amount) || 0,
          previousBalance: Number(t.previousBalance) || 0,
          newBalance: Number(t.newBalance) || 0,
          createdAt: t.createdAt,
          description: t.description,
          gpsLat: t.gpsLat != null ? Number(t.gpsLat) : null,
          gpsLng: t.gpsLng != null ? Number(t.gpsLng) : null,
          companyId: t.companyId || null,
          createdBy: t.createdBy,
        }));

        // ── Per-company balances for this shop ──
        const scbRes = await pool.query(
          `SELECT "companyId", balance FROM "ShopCompanyBalance" WHERE "shopId" = $1`,
          [shop.id]
        );
        const scbBalances = new Map<string, number>();
        for (const row of scbRes.rows) {
          scbBalances.set(row.companyId, Number(row.balance) || 0);
        }
        const scbCompanyIds = Array.from(scbBalances.keys());

        // ── Resolve display company for every transaction ──
        const txnResolvedCompany = new Map<string, string>();
        for (const t of dayTxns) {
          txnResolvedCompany.set(t.id, resolveTxnCompany(t, scbCompanyIds, shop.companyId));
        }

        // Apply optional companyId filter AFTER resolution
        const countedTxns = companyId
          ? dayTxns.filter((t) => txnResolvedCompany.get(t.id) === companyId)
          : dayTxns;

        // Also fetch pending transactions to determine visited status
        // (only the OB's OWN pending recoveries mark a shop as visited for him)
        let pendingQuery = `SELECT id FROM "Transaction"
             WHERE "shopId" = $1 AND "createdAt" >= $2 AND "createdAt" <= $3 AND status = 'pending' AND type = 'recovery' AND "createdBy" = $4`;
        const pendingParams: (string | Date)[] = [shop.id, startDate.toISOString(), endDate.toISOString(), ob.id];

        if (companyId) {
          pendingQuery += ` AND "companyId" = $5`;
          pendingParams.push(companyId);
        }

        pendingQuery += ` LIMIT 1`;

        const pendingRes = await pool.query(pendingQuery, pendingParams);
        const hasPendingRecovery = pendingRes.rows.length > 0;

        // Credits always count (they are shop-level facts posted by admin).
        const todayCredit = countedTxns
          .filter((t) => t.type === 'credit')
          .reduce((s, t) => s + t.amount, 0);
        const recoveryTxns = countedTxns.filter((t) => t.type === 'recovery');
        // ── OWN-recovery attribution (preserved fix) ──
        // Each OB's report shows only the recoveries HE personally took.
        const ownRecoveryTxns = recoveryTxns.filter((t) => t.createdBy === ob.id);
        const todayRecovery = ownRecoveryTxns.reduce((s, t) => s + t.amount, 0);
        // ALL recoveries at the shop today (any OB) — used ONLY for the real
        // closing-balance math so the shop's balance stays accurate.
        const allRecoverySum = recoveryTxns.reduce((s, t) => s + t.amount, 0);
        const prevBalance = countedTxns.length > 0
          ? Number(countedTxns[countedTxns.length - 1].previousBalance) || 0
          : shop.balance;

        const recoveryEntries = ownRecoveryTxns.map((t) => ({
          id: t.id,
          amount: round2(t.amount),
          time: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
          description: t.description,
          hasGps: !!(t.gpsLat && t.gpsLng),
          gpsLat: t.gpsLat,
          gpsLng: t.gpsLng,
        }));

        // ── Build company-wise breakdown (UNION: SCB companies ∪ attributed txn companies) ──
        // Credits always count (shop-level facts). Recoveries: 'recovery' = this
        // OB's own (for display), 'allRecovery' = every OB's (for balance math).
        const txnByCompany = new Map<string, { credit: number; recovery: number; allRecovery: number }>();
        for (const t of countedTxns) {
          const cid = txnResolvedCompany.get(t.id) || GENERAL_COMPANY_ID;
          const existing = txnByCompany.get(cid) || { credit: 0, recovery: 0, allRecovery: 0 };
          if (t.type === 'credit') existing.credit += t.amount;
          else if (t.type === 'recovery') {
            existing.allRecovery += t.amount;
            if (t.createdBy === ob.id) existing.recovery += t.amount;
          }
          txnByCompany.set(cid, existing);
        }

        const includeIds = new Set<string>([...scbCompanyIds, ...txnByCompany.keys()]);
        const companyBreakdown: ShopCompanyBreakdown[] = [];

        for (const cid of includeIds) {
          const compTxns = txnByCompany.get(cid) || { credit: 0, recovery: 0, allRecovery: 0 };

          if (cid === GENERAL_COMPANY_ID) {
            // Catch-all for transactions with no company attribution.
            // Company balances are meaningless here; the shop-level row shows
            // the real totals.
            companyBreakdown.push({
              companyId: GENERAL_COMPANY_ID,
              companyName: 'General',
              previousBalance: 0,
              todayCredit: round2(compTxns.credit),
              todayRecovery: round2(compTxns.recovery), // this OB's own only
              closingBalance: 0,
            });
            continue;
          }

          const scbBal = scbBalances.get(cid);
          if (scbBal !== undefined) {
            // True previous balance = current balance - today's credit + today's
            // recovery (ALL recoveries, because the current balance already
            // includes every OB's recovery)
            const compPrevBalance = round2(scbBal - compTxns.credit + compTxns.allRecovery);
            companyBreakdown.push({
              companyId: cid,
              companyName: await getCompanyName(cid),
              previousBalance: compPrevBalance,
              todayCredit: round2(compTxns.credit),
              todayRecovery: round2(compTxns.recovery), // this OB's own only
              closingBalance: round2(compPrevBalance + compTxns.credit - compTxns.allRecovery),
            });
          } else {
            // Company appears only in transactions (no ShopCompanyBalance row)
            companyBreakdown.push({
              companyId: cid,
              companyName: await getCompanyName(cid),
              previousBalance: 0, // Can't determine without ShopCompanyBalance
              todayCredit: round2(compTxns.credit),
              todayRecovery: round2(compTxns.recovery), // this OB's own only
              closingBalance: 0,
            });
          }
        }

        // Deterministic order: companies with recovery/credit first
        companyBreakdown.sort(
          (a, b) => (b.todayRecovery - a.todayRecovery) || (b.todayCredit - a.todayCredit)
        );

        shopRecoveries.push({
          shopId: shop.id,
          shopName: shop.name,
          shopArea: shop.area,
          shopAddress: shop.address ?? null,
          companyId: shop.companyId,
          previousBalance: round2(prevBalance),
          todayCredit: round2(todayCredit),
          todayRecovery: round2(todayRecovery), // this OB's own recoveries only
          // Closing = REAL shop balance: prev + credit - ALL recoveries taken
          // at this shop today (by any OB), so outstanding stays accurate.
          closingBalance: round2(prevBalance + todayCredit - allRecoverySum),
          visited: ownRecoveryTxns.length > 0 || hasPendingRecovery,
          companyBreakdown,
          recoveryEntries, // this OB's own recoveries only
        });
      }

      const totalRecovery = shopRecoveries.reduce((s, shop) => s + shop.todayRecovery, 0);
      const visitedShops = shopRecoveries.filter((s) => s.visited).length;

      // ── OB-level company breakdown: aggregate from shop-level breakdowns ──
      // (Previously derived from secondary-assignment companyIds + a raw SQL
      // aggregate over primary shops — which missed mislabeled transactions and
      // never included General. Aggregating the shop-level breakdowns keeps the
      // OB totals consistent with what the report table actually shows. This
      // also removes a latent ReferenceError in the old name-backfill block.)
      const companyMap = new Map<string, { companyId: string; companyName: string; totalRecovery: number; shops: Set<string> }>();

      for (const sr of shopRecoveries) {
        for (const comp of sr.companyBreakdown) {
          if (comp.todayRecovery <= 0 && comp.todayCredit <= 0) continue;
          const existing = companyMap.get(comp.companyId);
          if (existing) {
            existing.totalRecovery += comp.todayRecovery;
            existing.shops.add(sr.shopId);
          } else {
            companyMap.set(comp.companyId, {
              companyId: comp.companyId,
              companyName: comp.companyName,
              totalRecovery: comp.todayRecovery,
              shops: new Set([sr.shopId]),
            });
          }
        }
      }

      const companyBreakdown: CompanyBreakdown[] = Array.from(companyMap.values())
        .sort((a, b) => b.totalRecovery - a.totalRecovery)
        .map((c) => ({
          companyId: c.companyId,
          companyName: c.companyName,
          totalRecovery: round2(c.totalRecovery),
          shops: c.shops.size,
        }));

      return {
        orderbookerId: ob.id,
        orderbookerName: ob.name,
        orderbookerPhone: ob.phone,
        totalRecovery: round2(totalRecovery),
        totalShops: allShops.length,
        visitedShops,
        companyBreakdown,
        shops: shopRecoveries,
      };
    })
  );

  const grandTotalRecovery = recoverySummary.reduce((s: number, ob: { totalRecovery: number }) => s + ob.totalRecovery, 0);

  return {
    date: displayDate,
    grandTotalRecovery: round2(grandTotalRecovery),
    orderbookers: recoverySummary,
  };
}
