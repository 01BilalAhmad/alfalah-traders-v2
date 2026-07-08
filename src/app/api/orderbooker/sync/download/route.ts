import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { verifyToken } from '@/lib/jwt';

// Helper: Validate Bearer token from mobile app (supports JWT and legacy format)
function validateBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const verified = verifyToken(token);

  if (!verified.valid) return null;

  return verified.userId;
}

// GET /api/orderbooker/sync/download
// Mobile app sync download — returns shops, transactions, user info, etc.
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const userId = validateBearerToken(authHeader);

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 },
      );
    }

    const pool = getPool();

    // Verify user exists and is active
    const userCheck = await pool.query(
      'SELECT id, username, name, role, phone, status, "companyId" FROM "User" WHERE id = $1',
      [userId],
    );

    if (userCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 401 },
      );
    }

    const dbUser = userCheck.rows[0];

    if (dbUser.status === 'inactive') {
      return NextResponse.json(
        { success: false, message: 'Account is deactivated' },
        { status: 403 },
      );
    }

    // 1. Get ACTIVE shops assigned to this orderbooker
    const shopRes = await pool.query(
      `SELECT DISTINCT s.*, u.name AS "ob_name"
       FROM "Shop" s
       LEFT JOIN "User" u ON s."orderbookerId" = u.id
       WHERE s.status = 'active'
         AND (
           s."orderbookerId" = $1
           OR EXISTS (
             SELECT 1 FROM "ShopOrderbooker" so
             WHERE so."shopId" = s.id AND so."orderbookerId" = $1
           )
         )
       ORDER BY s.name ASC`,
      [userId],
    );

    const shops = shopRes.rows.map((s: any) => ({
      id: s.id,
      name: s.name,
      ownerName: s.ownerName || undefined,
      ownerPhone: s.ownerPhone || s.phone || undefined,
      address: s.address || undefined,
      phone: s.phone || undefined,
      balance: Number(s.balance),
      routeDays: s.routeDays || [],
      latitude: s.latitude || undefined,
      longitude: s.longitude || undefined,
      area: s.area || undefined,
      city: s.city || undefined,
      lastVisitDate: s.lastVisitDate || undefined,
      lastRecoveryAmount: s.lastRecoveryAmount || undefined,
      shopOrderbookerId: s.orderbookerId || undefined,
      visitStatus: 'pending' as const,
      isVisited: false,
      isAttempted: false,
    }));

    // 1b. Get company balances for all synced shops
    try {
      const shopIds = shops.map((s: any) => s.id);
      if (shopIds.length > 0) {
        const scbRes = await pool.query(
          `SELECT scb."shopId", scb."companyId", scb.balance, scb."creditLimit", co.name AS "companyName"
           FROM "ShopCompanyBalance" scb
           LEFT JOIN "Company" co ON scb."companyId" = co.id
           WHERE scb."shopId" = ANY($1)`,
          [shopIds],
        );
        const companyBalancesMap: Record<string, any[]> = {};
        for (const row of scbRes.rows) {
          if (!companyBalancesMap[row.shopId]) companyBalancesMap[row.shopId] = [];
          companyBalancesMap[row.shopId].push({
            companyId: row.companyId,
            companyName: row.companyName,
            balance: Number(row.balance),
            creditLimit: Number(row.creditLimit),
          });
        }
        for (const shop of shops) {
          (shop as any).outstandingBreakdown = {
            current: Number(s.balance) || 0,
            overdue: 0,
            total: Number(s.balance) || 0,
          };
        }
      }
    } catch {
      // ShopCompanyBalance table might not exist yet
    }

    // 1c. Get route day overrides from ShopOrderbooker
    try {
      const junctionRes = await pool.query(
        `SELECT so."shopId", so."routeDays", so."companyId"
         FROM "ShopOrderbooker" so
         WHERE so."orderbookerId" = $1`,
        [userId],
      );
      const junctionMap: Record<string, { routeDays: string[]; companyId: string }> = {};
      for (const row of junctionRes.rows) {
        junctionMap[row.shopId] = {
          routeDays: row.routeDays || [],
          companyId: row.companyId,
        };
      }
      for (const shop of shops) {
        if (junctionMap[shop.id]) {
          (shop as any).routeDays = junctionMap[shop.id].routeDays;
        }
      }
    } catch {
      // ShopOrderbooker table might not exist yet
    }

    // 2. Get recent transactions (last 200) for this orderbooker's shops
    const shopIds = shops.map((s: any) => s.id);
    let transactions: any[] = [];
    if (shopIds.length > 0) {
      const txRes = await pool.query(
        `SELECT t.*, s.name AS "shopName", u.name AS "createdByName"
         FROM "Transaction" t
         LEFT JOIN "Shop" s ON t."shopId" = s.id
         LEFT JOIN "User" u ON t."createdBy" = u.id
         WHERE t.status != 'rejected'
           AND (t."createdBy" = $1 OR t."shopId" = ANY($2))
         ORDER BY t."createdAt" DESC
         LIMIT 200`,
        [userId, shopIds],
      );
      transactions = txRes.rows.map((t: any) => ({
        id: t.id,
        shopId: t.shopId,
        shopName: t.shopName,
        type: t.type,
        amount: Number(t.amount),
        status: t.status,
        companyId: t.companyId || null,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
      }));
    }

    // 3. Get user's companies
    let userCompanies: {
      companyId: string;
      companyName: string;
      distributorPhone: string | null;
      isPrimary: boolean;
    }[] = [];

    try {
      const ucRes = await pool.query(
        `SELECT uc."companyId", uc."isPrimary", c.name AS "companyName", c."distributorPhone"
         FROM "UserCompany" uc
         JOIN "Company" c ON uc."companyId" = c.id
         WHERE uc."userId" = $1 AND c.status = 'active'
         ORDER BY uc."isPrimary" DESC, c.name ASC`,
        [userId],
      );
      userCompanies = ucRes.rows.map((row: any) => ({
        companyId: row.companyId,
        companyName: row.companyName,
        distributorPhone: row.distributorPhone || null,
        isPrimary: row.isPrimary,
      }));
    } catch {
      // UserCompany table might not exist yet
    }

    // Fallback
    if (userCompanies.length === 0 && dbUser.companyId) {
      const primaryComp = await pool.query(
        'SELECT id, name, "distributorPhone" FROM "Company" WHERE id = $1 AND status = \'active\'',
        [dbUser.companyId],
      );
      if (primaryComp.rows.length > 0) {
        userCompanies.push({
          companyId: primaryComp.rows[0].id,
          companyName: primaryComp.rows[0].name,
          distributorPhone: primaryComp.rows[0].distributorPhone || null,
          isPrimary: true,
        });
      }
    }

    const primaryCompany = userCompanies.find((c) => c.isPrimary) || userCompanies[0] || null;

    // 4. Get shop notes
    let shopNotes: any[] = [];
    try {
      const notesRes = await pool.query(
        `SELECT n.id, n."shopId", n.note, n."createdBy", n."createdAt"
         FROM "ShopNote" n
         INNER JOIN "Shop" s ON n."shopId" = s.id
         WHERE s."orderbookerId" = $1
            OR EXISTS (
              SELECT 1 FROM "ShopOrderbooker" so
              WHERE so."shopId" = s.id AND so."orderbookerId" = $1
            )
         ORDER BY n."createdAt" DESC`,
        [userId],
      );
      shopNotes = notesRes.rows.map((n: any) => ({
        id: n.id,
        shopId: n.shopId,
        note: n.note,
      }));
    } catch { /* ShopNote might not exist */ }

    // 5. Get daily target
    let dailyTarget: any = null;
    try {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const targetRes = await pool.query(
        'SELECT * FROM "DailyTarget" WHERE "orderbookerId" = $1 AND month = $2',
        [userId, currentMonth],
      );
      if (targetRes.rows.length > 0) {
        dailyTarget = {
          target: Number(targetRes.rows[0].target),
          month: targetRes.rows[0].month,
        };
      }
    } catch { /* DailyTarget might not exist */ }

    // Build mobile-friendly orderbooker user object
    const orderbooker = {
      id: dbUser.id,
      username: dbUser.username,
      name: dbUser.name,
      phone: dbUser.phone || undefined,
      role: dbUser.role,
      companyId: primaryCompany?.companyId || dbUser.companyId || '',
      companyName: primaryCompany?.companyName || '',
      distributorName: primaryCompany?.companyName || '',
      distributorPhone: primaryCompany?.distributorPhone || undefined,
      companies: userCompanies,
    };

    // Return in the format the mobile app's SyncDownloadData type expects
    return NextResponse.json({
      success: true,
      orderbooker,
      shops,
      transactions,
      routeDate: new Date().toISOString().split('T')[0],
      companyName: primaryCompany?.companyName || '',
      distributorName: primaryCompany?.companyName || '',
      distributorPhone: primaryCompany?.distributorPhone || '',
      shopNotes,
      dailyTarget,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Orderbooker sync download error:', error);
    return NextResponse.json(
      { success: false, message: 'Sync download failed' },
      { status: 500 },
    );
  }
}
