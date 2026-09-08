import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';

// GET /api/teller/ledgers — bulk offline ledger pack for the teller app
//
// Query params:
//   shopIds  — comma-separated shop list (optional). Omit = ALL shops assigned
//              to this teller.
//   perShop  — recent transactions per shop (default 20, clamped 5..50)
//
// Returns a lean, storage-friendly ledger per shop. LeanTx rows are ~130 bytes
// vs ~500 bytes for the full /api/reports/ledger shape — the whole pack has to
// fit comfortably inside AsyncStorage's 6MB limit on Android:
//   {
//     generatedAt: ISO,
//     ledgers: {
//       [shopId]: {
//         summary: { totalCredit, totalRecovery, totalClaims, totalTransactions, currentBalance },
//         transactions: [ { id, type, status, amount, balanceAfter, createdAt, creatorName, companyName } ]
//         // transactions = the perShop MOST RECENT rows, oldest → newest
//       }
//     }
//   }
//
// - Summary totals are computed over ALL approved+pending transactions of the
//   shop (same math as /api/reports/ledger), NOT just the recent window.
// - Teller authorization + shop scoping mirrors /api/teller/sync:
//   TellerAssignment → orderbookerId → active shops. A teller can never read
//   a foreign shop's ledger, even when passing arbitrary shopIds.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const isTeller = auth.user?.role === 'teller';
    const isAdmin = auth.user?.role === 'admin';
    if (!isTeller && !isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const perShopRaw = parseInt(searchParams.get('perShop') ?? '20', 10);
    const perShop = Math.min(Math.max(Number.isNaN(perShopRaw) ? 20 : perShopRaw, 5), 50);
    const shopIdsParam = searchParams.get('shopIds');

    const pool = getPool();
    const tellerId = auth.userId;
    const emptyPack = NextResponse.json({
      generatedAt: new Date().toISOString(),
      ledgers: {},
    });

    // ── 1. Resolve the shop list (teller-scoped) ──────────────────
    const assignedRes = await pool.query(
      `SELECT "orderbookerId" FROM "TellerAssignment" WHERE "tellerId" = $1`,
      [tellerId]
    );
    const obIds = assignedRes.rows.map((r: any) => r.orderbookerId);
    if (obIds.length === 0) {
      return emptyPack;
    }

    let shopIds: string[];
    if (shopIdsParam) {
      const requested = shopIdsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 100);
      if (requested.length === 0) {
        return emptyPack;
      }
      // Validate the requested shops belong to this teller's assignment tree
      const validRes = await pool.query(
        `SELECT id FROM "Shop"
         WHERE id = ANY($1::text[]) AND status = 'active' AND "orderbookerId" = ANY($2::text[])`,
        [requested, obIds]
      );
      shopIds = validRes.rows.map((r: any) => r.id);
    } else {
      const shopsRes = await pool.query(
        `SELECT id FROM "Shop" WHERE status = 'active' AND "orderbookerId" = ANY($1::text[])`,
        [obIds]
      );
      shopIds = shopsRes.rows.map((r: any) => r.id);
    }

    if (shopIds.length === 0) {
      return emptyPack;
    }

    // ── 2. Shop balances (currentBalance) ─────────────────────────
    const balancesRes = await pool.query(
      `SELECT id, balance FROM "Shop" WHERE id = ANY($1::text[])`,
      [shopIds]
    );
    const balanceMap = new Map<string, number>();
    for (const r of balancesRes.rows) {
      balanceMap.set(r.id, Number(r.balance) || 0);
    }

    // ── 3. Summary aggregates over ALL non-rejected transactions ──
    // Same math as /api/reports/ledger (recovery includes supplier_collection,
    // claims reported separately, only approved rows counted).
    const summaryRes = await pool.query(
      `SELECT "shopId",
              COALESCE(SUM(CASE WHEN type = 'credit' AND status = 'approved' THEN amount ELSE 0 END), 0) AS "totalCredit",
              COALESCE(SUM(CASE WHEN type IN ('recovery','supplier_collection') AND status = 'approved' THEN amount ELSE 0 END), 0) AS "totalRecovery",
              COALESCE(SUM(CASE WHEN type = 'claim' AND status = 'approved' THEN amount ELSE 0 END), 0) AS "totalClaims",
              COUNT(*) FILTER (WHERE status = 'approved') AS "approvedCount"
       FROM "Transaction"
       WHERE "shopId" = ANY($1::text[]) AND status != 'rejected'
       GROUP BY "shopId"`,
      [shopIds]
    );
    const summaryMap = new Map<string, any>();
    for (const r of summaryRes.rows) {
      summaryMap.set(r.shopId, {
        totalCredit: Math.round(Number(r.totalCredit) * 100) / 100,
        totalRecovery: Math.round(Number(r.totalRecovery) * 100) / 100,
        totalClaims: Math.round(Number(r.totalClaims) * 100) / 100,
        totalTransactions: Number(r.approvedCount) || 0,
      });
    }

    // ── 4. Recent transactions per shop (single window-function query) ──
    // ROW_NUMBER per shop ordered newest-first, then rn <= perShop → the
    // perShop most recent rows. Final output is oldest → newest (ASC) so the
    // ledger reads chronologically like the web ledger page.
    const txnRes = await pool.query(
      `SELECT * FROM (
         SELECT t.id, t."shopId", t.type, t.status, t.amount, t."newBalance",
                t."createdAt", u.name AS "creatorName", co.name AS "companyName",
                ROW_NUMBER() OVER (PARTITION BY t."shopId" ORDER BY t."createdAt" DESC, t.id DESC) AS rn
         FROM "Transaction" t
         LEFT JOIN "User" u ON t."createdBy" = u.id
         LEFT JOIN "Company" co ON t."companyId" = co.id
         WHERE t."shopId" = ANY($1::text[]) AND t.status != 'rejected'
       ) ranked
       WHERE rn <= $2
       ORDER BY "shopId" ASC, "createdAt" ASC, id ASC`,
      [shopIds, perShop]
    );

    const txMap = new Map<string, any[]>();
    for (const t of txnRes.rows) {
      if (!txMap.has(t.shopId)) txMap.set(t.shopId, []);
      txMap.get(t.shopId)!.push({
        id: t.id,
        type: t.type,
        status: t.status,
        amount: Number(t.amount),
        balanceAfter: Number(t.newBalance),
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        creatorName: t.creatorName ?? null,
        companyName: t.companyName ?? null,
      });
    }

    // ── 5. Assemble the pack ──────────────────────────────────────
    const ledgers: Record<string, any> = {};
    for (const shopId of shopIds) {
      const summary = summaryMap.get(shopId);
      ledgers[shopId] = {
        summary: {
          totalCredit: summary?.totalCredit ?? 0,
          totalRecovery: summary?.totalRecovery ?? 0,
          totalClaims: summary?.totalClaims ?? 0,
          totalTransactions: summary?.totalTransactions ?? 0,
          currentBalance: balanceMap.get(shopId) ?? 0,
        },
        transactions: txMap.get(shopId) ?? [],
      };
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      ledgers,
    });
  } catch (error) {
    console.error('[Teller Ledgers API] error:', error);
    return NextResponse.json({ error: 'Failed to build offline ledgers' }, { status: 500 });
  }
}
