import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-guard';
import bcrypt from 'bcryptjs';

// ────────────────────────────────────────────────────────────
// GET /api/backup — Export all data as a JSON backup (Admin only)
// ────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  try {
    const [
      users, shopsRaw, transactions, auditLogs, companies,
      shopCompanyBalances, userCompanies, shopOrderbookersRaw,
      dailyTargets, shopNotes, shopVisits,
    ] = await Promise.all([
      db.user.findMany({
        select: {
          id: true, username: true, name: true, role: true,
          phone: true, email: true, status: true, allRoutesEnabled: true,
          companyId: true, createdAt: true, updatedAt: true,
          // SECURITY: password hash excluded from backup export
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.shop.findMany({
        select: {
          id: true, name: true, ownerName: true, area: true, address: true,
          phone: true, routeDays: true, orderbookerId: true, balance: true,
          creditLimit: true, status: true, lat: true, lng: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.transaction.findMany({
        select: {
          id: true, shopId: true, type: true, status: true, amount: true,
          previousBalance: true, newBalance: true, description: true,
          createdBy: true, approvedBy: true, approvedAt: true, rejectReason: true,
          gpsLat: true, gpsLng: true, gpsAddress: true, companyId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.auditLog.findMany({
        select: {
          id: true, action: true, entityType: true, entityId: true,
          performedBy: true, oldValue: true, newValue: true,
          description: true, createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.company.findMany({
        select: {
          id: true, name: true, description: true, distributorPhone: true,
          status: true, createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.shopCompanyBalance.findMany({
        select: {
          id: true, shopId: true, companyId: true, balance: true,
          creditLimit: true, createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.userCompany.findMany({
        select: {
          id: true, userId: true, companyId: true, isPrimary: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.shopOrderbooker.findMany({
        select: {
          id: true, shopId: true, orderbookerId: true, companyId: true,
          routeDays: true, createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.dailyTarget.findMany({
        select: {
          id: true, orderbookerId: true, target: true, month: true,
          createdBy: true, createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.shopNote.findMany({
        select: {
          id: true, shopId: true, note: true, createdBy: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.shopVisit.findMany({
        select: {
          id: true, shopId: true, orderbookerId: true, gpsLat: true,
          gpsLng: true, gpsAddress: true, inRange: true, createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // routeDays is returned as native array from PostgreSQL
    const shops = shopsRaw;
    const shopOrderbookers = shopOrderbookersRaw;

    const backup = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      metadata: {
        application: 'Finexa - Smart Credit Management',
        counts: {
          users: users.length, shops: shops.length,
          transactions: transactions.length, auditLogs: auditLogs.length,
          companies: companies.length, shopCompanyBalances: shopCompanyBalances.length,
          userCompanies: userCompanies.length, shopOrderbookers: shopOrderbookers.length,
          dailyTargets: dailyTargets.length, shopNotes: shopNotes.length,
          shopVisits: shopVisits.length,
        },
      },
      data: {
        users, shops, transactions, auditLogs, companies,
        shopCompanyBalances, userCompanies, shopOrderbookers,
        dailyTargets, shopNotes, shopVisits,
      },
    };

    const dateStr = new Date().toISOString().split('T')[0];
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="finexa-backup-${dateStr}.json"`,
      },
    });
  } catch (error) {
    console.error('Error creating backup export:', error);
    return NextResponse.json({ error: 'Failed to export backup data' }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────
// POST /api/backup — Import / Restore
// Supports two modes via ?mode= query param:
//   "replace" (default) — Clears existing data, imports fresh
//   "merge"             — Adds missing records, keeps existing
// ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const currentAdminId = auth.userId;

  try {
    // ── Parse backup file ──────────────────────────────────
    let body: Record<string, unknown>;
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
      }
      if (!file.name.endsWith('.json')) {
        return NextResponse.json({ error: 'Invalid file type. Please upload a .json file.' }, { status: 400 });
      }
      const fileContent = await file.text();
      try { body = JSON.parse(fileContent); } catch {
        return NextResponse.json({ error: 'Invalid JSON file.' }, { status: 400 });
      }
    } else {
      body = await request.json();
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const data = (body.data || body) as Record<string, unknown>;
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Invalid backup format — missing "data" section' }, { status: 400 });
    }

    // ── Get mode from URL ──────────────────────────────────
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'replace';

    // ── Extract arrays ─────────────────────────────────────
    const users = (data.users || []) as Record<string, unknown>[];
    const shops = (data.shops || []) as Record<string, unknown>[];
    const transactions = (data.transactions || []) as Record<string, unknown>[];
    const auditLogs = (data.auditLogs || []) as Record<string, unknown>[];
    const companies = (data.companies || []) as Record<string, unknown>[];
    const shopCompanyBalances = (data.shopCompanyBalances || []) as Record<string, unknown>[];
    const userCompanies = (data.userCompanies || []) as Record<string, unknown>[];
    const shopOrderbookers = (data.shopOrderbookers || []) as Record<string, unknown>[];
    const dailyTargets = (data.dailyTargets || []) as Record<string, unknown>[];
    const shopNotes = (data.shopNotes || []) as Record<string, unknown>[];
    const shopVisits = (data.shopVisits || []) as Record<string, unknown>[];

    if (!Array.isArray(users) || !Array.isArray(shops)) {
      return NextResponse.json({ error: 'Invalid backup — users and shops must be arrays' }, { status: 400 });
    }

    // ── ID Maps ────────────────────────────────────────────
    const userIdMap = new Map<string, string>();
    const shopIdMap = new Map<string, string>();
    const companyIdMap = new Map<string, string>();

    const counts = {
      companies: 0, users: 0, shops: 0, transactions: 0,
      shopCompanyBalances: 0, userCompanies: 0, shopOrderbookers: 0,
      dailyTargets: 0, shopNotes: 0, shopVisits: 0, auditLogs: 0,
    };

    // ══════════════════════════════════════════════════════════
    // REPLACE MODE — Clear everything, import fresh
    // ══════════════════════════════════════════════════════════
    if (mode === 'replace') {
      // Step 1: Delete all data (keep current admin user)
      console.log('[BACKUP-IMPORT] Replace mode: clearing existing data...');
      await db.auditLog.deleteMany({});
      await db.shopNote.deleteMany({});
      await db.shopVisit.deleteMany({});
      await db.shopCompanyBalance.deleteMany({});
      await db.shopOrderbooker.deleteMany({});
      await db.dailyTarget.deleteMany({});
      await db.userCompany.deleteMany({});
      await db.transaction.deleteMany({});
      await db.shop.deleteMany({});
      // Delete all users EXCEPT the current admin
      await db.user.deleteMany({
        where: { id: { not: currentAdminId } },
      });
      // Delete all companies
      await db.company.deleteMany({});

      // Step 2: Map backup admin users → current admin
      for (const user of users) {
        if (user.role === 'admin' && user.id) {
          userIdMap.set(String(user.id), currentAdminId);
        }
      }

      // Step 3: Create companies (bulk)
      if (companies.length > 0) {
        const companyData = companies
          .filter(c => c.name)
          .map(c => ({
            name: String(c.name),
            description: c.description ? String(c.description) : null,
            distributorPhone: c.distributorPhone ? String(c.distributorPhone) : null,
            status: String(c.status || 'active'),
          }));

        if (companyData.length > 0) {
          await db.company.createMany({ data: companyData, skipDuplicates: true });
          const newCompanies = await db.company.findMany({
            where: { name: { in: companyData.map(c => c.name) } },
            select: { id: true, name: true },
          });
          for (const nc of newCompanies) {
            const bc = companies.find(c => String(c.name) === nc.name);
            if (bc?.id) companyIdMap.set(String(bc.id), nc.id);
          }
          counts.companies = companyData.length;
        }
      }

      // Step 4: Create users (one by one — we need IDs for mapping)
      console.log('[BACKUP-IMPORT] Creating users...');
      for (const user of users) {
        if (!user.username) continue;
        if (user.role === 'admin') continue; // Already mapped to current admin

        let passwordValue = String(user.password || 'ob123');
        if (!passwordValue.startsWith('$2a$') && !passwordValue.startsWith('$2b$')) {
          passwordValue = await bcrypt.hash(passwordValue, 10);
        }

        const newCompanyRef = user.companyId
          ? (companyIdMap.get(String(user.companyId)) || null)
          : null;

        try {
          const newUser = await db.user.create({
            data: {
              username: String(user.username),
              password: passwordValue,
              name: String(user.name || user.username),
              role: String(user.role || 'orderbooker'),
              phone: user.phone ? String(user.phone) : null,
              email: user.email ? String(user.email) : null,
              status: String(user.status || 'active'),
              allRoutesEnabled: Boolean(user.allRoutesEnabled || false),
              companyId: newCompanyRef,
            },
          });
          if (user.id) userIdMap.set(String(user.id), newUser.id);
          counts.users++;
        } catch (err) {
          console.error(`[BACKUP-IMPORT] Failed to create user ${user.username}:`, err);
        }
      }

      // Step 5: Create shops (BULK INSERT — fast!)
      console.log('[BACKUP-IMPORT] Creating shops (bulk)...');
      const shopDataToInsert: {
        name: string; ownerName: string | null; area: string | null;
        address: string | null; phone: string | null; routeDays: string[];
        orderbookerId: string; balance: number; creditLimit: number;
        status: string; lat: number | null; lng: number | null;
      }[] = [];
      const shopMetaForMapping: { oldId: string | null; name: string; orderbookerId: string }[] = [];

      for (const shop of shops) {
        if (!shop.name) continue;

        // Resolve orderbookerId using the userIdMap
        let resolvedObId: string | null = null;
        if (shop.orderbookerId) {
          resolvedObId = userIdMap.get(String(shop.orderbookerId)) || null;
        }
        // If no mapping found, try to find a user by the raw orderbookerId
        // (in case it's already a valid ID in the new DB)
        if (!resolvedObId && shop.orderbookerId) {
          const existingUser = await db.user.findUnique({
            where: { id: String(shop.orderbookerId) },
            select: { id: true },
          });
          if (existingUser) {
            resolvedObId = existingUser.id;
            userIdMap.set(String(shop.orderbookerId), existingUser.id);
          }
        }
        if (!resolvedObId) continue; // Skip shops with unmapped orderbookers

        // Parse routeDays: backup may have array or JSON string
        const parsedRouteDays: string[] = Array.isArray(shop.routeDays)
          ? shop.routeDays as string[]
          : (shop.routeDay ? [String(shop.routeDay)] : ['monday']);

        shopDataToInsert.push({
          name: String(shop.name),
          ownerName: shop.ownerName ? String(shop.ownerName) : null,
          area: shop.area ? String(shop.area) : null,
          address: shop.address ? String(shop.address) : null,
          phone: shop.phone ? String(shop.phone) : null,
          routeDays: parsedRouteDays,
          orderbookerId: resolvedObId,
          balance: Number(shop.balance || 0),
          creditLimit: Number(shop.creditLimit || 0),
          status: String(shop.status || 'active'),
          lat: shop.lat ? Number(shop.lat) : null,
          lng: shop.lng ? Number(shop.lng) : null,
        });
        shopMetaForMapping.push({
          oldId: shop.id ? String(shop.id) : null,
          name: String(shop.name),
          orderbookerId: resolvedObId,
        });
      }

      if (shopDataToInsert.length > 0) {
        // Insert in batches of 200 to avoid query size limits
        const SHOP_BATCH = 200;
        for (let i = 0; i < shopDataToInsert.length; i += SHOP_BATCH) {
          const batch = shopDataToInsert.slice(i, i + SHOP_BATCH);
          await db.shop.createMany({ data: batch });
        }
        counts.shops = shopDataToInsert.length;
        console.log(`[BACKUP-IMPORT] Created ${counts.shops} shops`);

        // Build shop ID map by querying back the created shops
        const uniqueShopNames = [...new Set(shopDataToInsert.map(s => s.name))];
        const uniqueObIds = [...new Set(shopDataToInsert.map(s => s.orderbookerId))];

        const createdShops = await db.shop.findMany({
          where: {
            name: { in: uniqueShopNames },
            orderbookerId: { in: uniqueObIds },
          },
          select: { id: true, name: true, orderbookerId: true },
        });

        for (const meta of shopMetaForMapping) {
          if (!meta.oldId) continue;
          const match = createdShops.find(
            s => s.name === meta.name && s.orderbookerId === meta.orderbookerId
          );
          if (match) {
            shopIdMap.set(meta.oldId, match.id);
          }
        }
      }

      // Step 6: Create transactions (bulk)
      console.log('[BACKUP-IMPORT] Creating transactions (bulk)...');
      const txnDataToInsert: {
        shopId: string; type: string; status: string; amount: number;
        previousBalance: number; newBalance: number; description: string | null;
        createdBy: string; approvedBy: string | null; approvedAt: Date | null;
        rejectReason: string | null; gpsLat: number | null; gpsLng: number | null;
        gpsAddress: string | null; companyId: string | null; createdAt: Date;
      }[] = [];

      for (const txn of transactions) {
        const newShopId = shopIdMap.get(String(txn.shopId || ''));
        const newCreatorId = userIdMap.get(String(txn.createdBy || ''));

        if (!newShopId) continue; // Skip if shop not found
        // If creator not in map, use current admin as fallback
        const creatorId = newCreatorId || currentAdminId;

        const newCompanyId = txn.companyId ? (companyIdMap.get(String(txn.companyId)) || null) : null;
        const newApprovedBy = txn.approvedBy ? (userIdMap.get(String(txn.approvedBy)) || null) : null;

        txnDataToInsert.push({
          shopId: newShopId,
          type: String(txn.type || 'credit'),
          status: String(txn.status || 'approved'),
          amount: Number(txn.amount || 0),
          previousBalance: Number(txn.previousBalance || 0),
          newBalance: Number(txn.newBalance || 0),
          description: txn.description ? String(txn.description) : null,
          createdBy: creatorId,
          approvedBy: newApprovedBy,
          approvedAt: txn.approvedAt ? new Date(String(txn.approvedAt)) : null,
          rejectReason: txn.rejectReason ? String(txn.rejectReason) : null,
          gpsLat: txn.gpsLat ? Number(txn.gpsLat) : null,
          gpsLng: txn.gpsLng ? Number(txn.gpsLng) : null,
          gpsAddress: txn.gpsAddress ? String(txn.gpsAddress) : null,
          companyId: newCompanyId,
          createdAt: txn.createdAt ? new Date(String(txn.createdAt)) : new Date(),
        });
      }

      if (txnDataToInsert.length > 0) {
        const TXN_BATCH = 200;
        for (let i = 0; i < txnDataToInsert.length; i += TXN_BATCH) {
          const batch = txnDataToInsert.slice(i, i + TXN_BATCH);
          await db.transaction.createMany({ data: batch });
        }
        counts.transactions = txnDataToInsert.length;
        console.log(`[BACKUP-IMPORT] Created ${counts.transactions} transactions`);
      }

      // Step 7: Create remaining data (bulk)
      // ShopCompanyBalances
      if (shopCompanyBalances.length > 0) {
        const scbData = shopCompanyBalances
          .map(scb => {
            const newShopId = shopIdMap.get(String(scb.shopId || ''));
            const newCompanyId = companyIdMap.get(String(scb.companyId || ''));
            if (!newShopId || !newCompanyId) return null;
            return { shopId: newShopId, companyId: newCompanyId, balance: Number(scb.balance || 0), creditLimit: Number(scb.creditLimit || 0) };
          })
          .filter(Boolean) as { shopId: string; companyId: string; balance: number; creditLimit: number }[];
        if (scbData.length > 0) {
          await db.shopCompanyBalance.createMany({ data: scbData, skipDuplicates: true });
          counts.shopCompanyBalances = scbData.length;
        }
      }

      // UserCompanies
      if (userCompanies.length > 0) {
        const ucData = userCompanies
          .map(uc => {
            const newUserId = userIdMap.get(String(uc.userId || ''));
            const newCompanyId = companyIdMap.get(String(uc.companyId || ''));
            if (!newUserId || !newCompanyId) return null;
            return { userId: newUserId, companyId: newCompanyId, isPrimary: Boolean(uc.isPrimary || false) };
          })
          .filter(Boolean) as { userId: string; companyId: string; isPrimary: boolean }[];
        if (ucData.length > 0) {
          await db.userCompany.createMany({ data: ucData, skipDuplicates: true });
          counts.userCompanies = ucData.length;
        }
      }

      // ShopOrderbookers
      if (shopOrderbookers.length > 0) {
        const soData = shopOrderbookers
          .map(so => {
            const newShopId = shopIdMap.get(String(so.shopId || ''));
            const newObId = userIdMap.get(String(so.orderbookerId || ''));
            const newCompanyId = companyIdMap.get(String(so.companyId || ''));
            if (!newShopId || !newObId || !newCompanyId) return null;
            return { shopId: newShopId, orderbookerId: newObId, companyId: newCompanyId, routeDays: Array.isArray(so.routeDays) ? so.routeDays as string[] : ['monday'] };
          })
          .filter(Boolean) as { shopId: string; orderbookerId: string; companyId: string; routeDays: string[] }[];
        if (soData.length > 0) {
          await db.shopOrderbooker.createMany({ data: soData, skipDuplicates: true });
          counts.shopOrderbookers = soData.length;
        }
      }

      // DailyTargets
      if (dailyTargets.length > 0) {
        const dtData = dailyTargets
          .map(dt => {
            const newObId = userIdMap.get(String(dt.orderbookerId || ''));
            const newCreatorId = userIdMap.get(String(dt.createdBy || ''));
            if (!newObId || !newCreatorId) return null;
            return { orderbookerId: newObId, target: Number(dt.target || 0), month: String(dt.month || ''), createdBy: newCreatorId };
          })
          .filter(Boolean) as { orderbookerId: string; target: number; month: string; createdBy: string }[];
        if (dtData.length > 0) {
          await db.dailyTarget.createMany({ data: dtData, skipDuplicates: true });
          counts.dailyTargets = dtData.length;
        }
      }

      // ShopNotes
      if (shopNotes.length > 0) {
        const snData = shopNotes
          .map(sn => {
            const newShopId = shopIdMap.get(String(sn.shopId || ''));
            const newCreatorId = userIdMap.get(String(sn.createdBy || ''));
            if (!newShopId || !newCreatorId) return null;
            return { shopId: newShopId, note: String(sn.note || ''), createdBy: newCreatorId, createdAt: sn.createdAt ? new Date(String(sn.createdAt)) : new Date() };
          })
          .filter(Boolean) as { shopId: string; note: string; createdBy: string; createdAt: Date }[];
        if (snData.length > 0) {
          await db.shopNote.createMany({ data: snData });
          counts.shopNotes = snData.length;
        }
      }

      // ShopVisits
      if (shopVisits.length > 0) {
        const svData = shopVisits
          .map(sv => {
            const newShopId = shopIdMap.get(String(sv.shopId || ''));
            const newObId = userIdMap.get(String(sv.orderbookerId || ''));
            if (!newShopId || !newObId) return null;
            return {
              shopId: newShopId, orderbookerId: newObId,
              gpsLat: sv.gpsLat ? Number(sv.gpsLat) : null,
              gpsLng: sv.gpsLng ? Number(sv.gpsLng) : null,
              gpsAddress: sv.gpsAddress ? String(sv.gpsAddress) : null,
              inRange: Boolean(sv.inRange !== false),
              createdAt: sv.createdAt ? new Date(String(sv.createdAt)) : new Date(),
            };
          })
          .filter(Boolean) as { shopId: string; orderbookerId: string; gpsLat: number | null; gpsLng: number | null; gpsAddress: string | null; inRange: boolean; createdAt: Date }[];
        if (svData.length > 0) {
          await db.shopVisit.createMany({ data: svData });
          counts.shopVisits = svData.length;
        }
      }

      // AuditLogs (skip in replace mode — not essential, saves time)
      counts.auditLogs = 0;

      console.log(`[BACKUP-IMPORT] Replace import complete:`, counts);

    // ══════════════════════════════════════════════════════════
    // MERGE MODE — Add missing records, keep existing
    // ══════════════════════════════════════════════════════════
    } else {
      // Load existing data for mapping
      const [existingUsers, existingShops, existingCompanies] = await Promise.all([
        db.user.findMany({ select: { id: true, username: true } }),
        db.shop.findMany({ select: { id: true, name: true, orderbookerId: true } }),
        db.company.findMany({ select: { id: true, name: true } }),
      ]);

      const existingUserMap = new Map(existingUsers.map(u => [u.username, u]));
      const existingShopSet = new Set(existingShops.map(s => `${s.name}|||${s.orderbookerId}`));
      const existingCompanyMap = new Map(existingCompanies.map(c => [c.name, c]));

      const backupUserById = new Map<string, Record<string, unknown>>();
      for (const u of users) {
        if (u.id) backupUserById.set(String(u.id), u);
      }

      // Map company IDs
      for (const company of companies) {
        if (!company.name) continue;
        const existing = existingCompanyMap.get(String(company.name));
        if (existing && company.id) {
          companyIdMap.set(String(company.id), existing.id);
        }
      }

      // Map user IDs: existing by username, or mark for creation
      const usersToCreate: Record<string, unknown>[] = [];

      for (const user of users) {
        if (!user.username) continue;
        const existing = existingUserMap.get(String(user.username));

        if (existing) {
          if (user.id) userIdMap.set(String(user.id), existing.id);
        } else {
          usersToCreate.push(user);
        }
      }

      // For shops: pre-resolve orderbookerIds
      for (const shop of shops) {
        if (!shop.orderbookerId) continue;
        const obIdStr = String(shop.orderbookerId);
        if (userIdMap.has(obIdStr)) continue;

        const backupUser = backupUserById.get(obIdStr);
        if (backupUser && backupUser.username) {
          const existing = existingUserMap.get(String(backupUser.username));
          if (existing) {
            userIdMap.set(obIdStr, existing.id);
          }
        }
      }

      // Create missing companies
      const newCompaniesToCreate = companies
        .filter(c => c.name && !existingCompanyMap.has(String(c.name)))
        .map(c => ({
          name: String(c.name),
          description: c.description ? String(c.description) : null,
          distributorPhone: c.distributorPhone ? String(c.distributorPhone) : null,
          status: String(c.status || 'active'),
        }));

      if (newCompaniesToCreate.length > 0) {
        await db.company.createMany({ data: newCompaniesToCreate, skipDuplicates: true });
        const newCompanies = await db.company.findMany({
          where: { name: { in: newCompaniesToCreate.map(c => c.name) } },
          select: { id: true, name: true },
        });
        for (const nc of newCompanies) {
          const bc = companies.find(c => String(c.name) === nc.name);
          if (bc?.id) companyIdMap.set(String(bc.id), nc.id);
        }
        counts.companies = newCompaniesToCreate.length;
      }

      // Create missing users
      for (const user of usersToCreate) {
        let passwordValue = String(user.password || 'ob123');
        if (!passwordValue.startsWith('$2a$') && !passwordValue.startsWith('$2b$')) {
          passwordValue = await bcrypt.hash(passwordValue, 10);
        }

        const newCompanyRef = user.companyId
          ? (companyIdMap.get(String(user.companyId)) || null)
          : null;

        try {
          const newUser = await db.user.create({
            data: {
              username: String(user.username),
              password: passwordValue,
              name: String(user.name || user.username),
              role: String(user.role || 'orderbooker'),
              phone: user.phone ? String(user.phone) : null,
              email: user.email ? String(user.email) : null,
              status: String(user.status || 'active'),
              allRoutesEnabled: Boolean(user.allRoutesEnabled || false),
              companyId: newCompanyRef,
            },
          });
          if (user.id) userIdMap.set(String(user.id), newUser.id);
          counts.users++;
        } catch (err) {
          console.error(`[BACKUP-IMPORT] Failed to create user ${user.username}:`, err);
        }
      }

      // Create missing shops (bulk)
      const shopDataToInsert: {
        name: string; ownerName: string | null; area: string | null;
        address: string | null; phone: string | null; routeDays: string[];
        orderbookerId: string; balance: number; creditLimit: number;
        status: string; lat: number | null; lng: number | null;
      }[] = [];
      const shopMetaForMapping: { oldId: string | null; name: string; orderbookerId: string }[] = [];
      let shopsSkipped = 0;

      for (const shop of shops) {
        if (!shop.name) { shopsSkipped++; continue; }

        let resolvedObId: string | null = null;
        if (shop.orderbookerId) {
          resolvedObId = userIdMap.get(String(shop.orderbookerId)) || null;
        }
        if (!resolvedObId) { shopsSkipped++; continue; }

        // Check if shop already exists
        const shopKey = `${String(shop.name)}|||${resolvedObId}`;
        if (existingShopSet.has(shopKey)) {
          const existingShop = existingShops.find(s => s.name === String(shop.name) && s.orderbookerId === resolvedObId);
          if (existingShop && shop.id) {
            shopIdMap.set(String(shop.id), existingShop.id);
          }
          shopsSkipped++;
          continue;
        }

        // Parse routeDays: backup may have array or JSON string
        const mergeRouteDays: string[] = Array.isArray(shop.routeDays) ? shop.routeDays as string[] : ['monday'];

        shopDataToInsert.push({
          name: String(shop.name),
          ownerName: shop.ownerName ? String(shop.ownerName) : null,
          area: shop.area ? String(shop.area) : null,
          address: shop.address ? String(shop.address) : null,
          phone: shop.phone ? String(shop.phone) : null,
          routeDays: mergeRouteDays,
          orderbookerId: resolvedObId,
          balance: Number(shop.balance || 0),
          creditLimit: Number(shop.creditLimit || 0),
          status: String(shop.status || 'active'),
          lat: shop.lat ? Number(shop.lat) : null,
          lng: shop.lng ? Number(shop.lng) : null,
        });
        shopMetaForMapping.push({
          oldId: shop.id ? String(shop.id) : null,
          name: String(shop.name),
          orderbookerId: resolvedObId,
        });
      }

      if (shopDataToInsert.length > 0) {
        const SHOP_BATCH = 200;
        for (let i = 0; i < shopDataToInsert.length; i += SHOP_BATCH) {
          const batch = shopDataToInsert.slice(i, i + SHOP_BATCH);
          await db.shop.createMany({ data: batch });
        }
        counts.shops = shopDataToInsert.length;

        // Build shop ID map
        const uniqueShopNames = [...new Set(shopDataToInsert.map(s => s.name))];
        const uniqueObIds = [...new Set(shopDataToInsert.map(s => s.orderbookerId))];
        const createdShops = await db.shop.findMany({
          where: { name: { in: uniqueShopNames }, orderbookerId: { in: uniqueObIds } },
          select: { id: true, name: true, orderbookerId: true },
        });

        for (const meta of shopMetaForMapping) {
          if (!meta.oldId) continue;
          const match = createdShops.find(s => s.name === meta.name && s.orderbookerId === meta.orderbookerId);
          if (match) shopIdMap.set(meta.oldId, match.id);
        }
      }

      // Create transactions (bulk)
      const txnDataToInsert: {
        shopId: string; type: string; status: string; amount: number;
        previousBalance: number; newBalance: number; description: string | null;
        createdBy: string; approvedBy: string | null; approvedAt: Date | null;
        rejectReason: string | null; gpsLat: number | null; gpsLng: number | null;
        gpsAddress: string | null; companyId: string | null; createdAt: Date;
      }[] = [];
      let transactionsSkipped = 0;

      for (const txn of transactions) {
        const newShopId = shopIdMap.get(String(txn.shopId || ''));
        const newCreatorId = userIdMap.get(String(txn.createdBy || ''));
        if (!newShopId || !newCreatorId) { transactionsSkipped++; continue; }

        const newCompanyId = txn.companyId ? (companyIdMap.get(String(txn.companyId)) || null) : null;
        const newApprovedBy = txn.approvedBy ? (userIdMap.get(String(txn.approvedBy)) || null) : null;

        txnDataToInsert.push({
          shopId: newShopId,
          type: String(txn.type || 'credit'),
          status: String(txn.status || 'approved'),
          amount: Number(txn.amount || 0),
          previousBalance: Number(txn.previousBalance || 0),
          newBalance: Number(txn.newBalance || 0),
          description: txn.description ? String(txn.description) : null,
          createdBy: newCreatorId,
          approvedBy: newApprovedBy,
          approvedAt: txn.approvedAt ? new Date(String(txn.approvedAt)) : null,
          rejectReason: txn.rejectReason ? String(txn.rejectReason) : null,
          gpsLat: txn.gpsLat ? Number(txn.gpsLat) : null,
          gpsLng: txn.gpsLng ? Number(txn.gpsLng) : null,
          gpsAddress: txn.gpsAddress ? String(txn.gpsAddress) : null,
          companyId: newCompanyId,
          createdAt: txn.createdAt ? new Date(String(txn.createdAt)) : new Date(),
        });
      }

      if (txnDataToInsert.length > 0) {
        const TXN_BATCH = 200;
        for (let i = 0; i < txnDataToInsert.length; i += TXN_BATCH) {
          const batch = txnDataToInsert.slice(i, i + TXN_BATCH);
          await db.transaction.createMany({ data: batch });
        }
        counts.transactions = txnDataToInsert.length;
      }

      // Remaining data (same as replace mode)
      if (shopCompanyBalances.length > 0) {
        const scbData = shopCompanyBalances
          .map(scb => {
            const newShopId = shopIdMap.get(String(scb.shopId || ''));
            const newCompanyId = companyIdMap.get(String(scb.companyId || ''));
            if (!newShopId || !newCompanyId) return null;
            return { shopId: newShopId, companyId: newCompanyId, balance: Number(scb.balance || 0), creditLimit: Number(scb.creditLimit || 0) };
          })
          .filter(Boolean) as { shopId: string; companyId: string; balance: number; creditLimit: number }[];
        if (scbData.length > 0) {
          await db.shopCompanyBalance.createMany({ data: scbData, skipDuplicates: true });
          counts.shopCompanyBalances = scbData.length;
        }
      }

      if (userCompanies.length > 0) {
        const ucData = userCompanies
          .map(uc => {
            const newUserId = userIdMap.get(String(uc.userId || ''));
            const newCompanyId = companyIdMap.get(String(uc.companyId || ''));
            if (!newUserId || !newCompanyId) return null;
            return { userId: newUserId, companyId: newCompanyId, isPrimary: Boolean(uc.isPrimary || false) };
          })
          .filter(Boolean) as { userId: string; companyId: string; isPrimary: boolean }[];
        if (ucData.length > 0) {
          await db.userCompany.createMany({ data: ucData, skipDuplicates: true });
          counts.userCompanies = ucData.length;
        }
      }

      if (shopOrderbookers.length > 0) {
        const soData = shopOrderbookers
          .map(so => {
            const newShopId = shopIdMap.get(String(so.shopId || ''));
            const newObId = userIdMap.get(String(so.orderbookerId || ''));
            const newCompanyId = companyIdMap.get(String(so.companyId || ''));
            if (!newShopId || !newObId || !newCompanyId) return null;
            return { shopId: newShopId, orderbookerId: newObId, companyId: newCompanyId, routeDays: Array.isArray(so.routeDays) ? so.routeDays as string[] : ['monday'] };
          })
          .filter(Boolean) as { shopId: string; orderbookerId: string; companyId: string; routeDays: string[] }[];
        if (soData.length > 0) {
          await db.shopOrderbooker.createMany({ data: soData, skipDuplicates: true });
          counts.shopOrderbookers = soData.length;
        }
      }

      if (dailyTargets.length > 0) {
        const dtData = dailyTargets
          .map(dt => {
            const newObId = userIdMap.get(String(dt.orderbookerId || ''));
            const newCreatorId = userIdMap.get(String(dt.createdBy || ''));
            if (!newObId || !newCreatorId) return null;
            return { orderbookerId: newObId, target: Number(dt.target || 0), month: String(dt.month || ''), createdBy: newCreatorId };
          })
          .filter(Boolean) as { orderbookerId: string; target: number; month: string; createdBy: string }[];
        if (dtData.length > 0) {
          await db.dailyTarget.createMany({ data: dtData, skipDuplicates: true });
          counts.dailyTargets = dtData.length;
        }
      }

      if (shopNotes.length > 0) {
        const snData = shopNotes
          .map(sn => {
            const newShopId = shopIdMap.get(String(sn.shopId || ''));
            const newCreatorId = userIdMap.get(String(sn.createdBy || ''));
            if (!newShopId || !newCreatorId) return null;
            return { shopId: newShopId, note: String(sn.note || ''), createdBy: newCreatorId, createdAt: sn.createdAt ? new Date(String(sn.createdAt)) : new Date() };
          })
          .filter(Boolean) as { shopId: string; note: string; createdBy: string; createdAt: Date }[];
        if (snData.length > 0) {
          await db.shopNote.createMany({ data: snData });
          counts.shopNotes = snData.length;
        }
      }

      if (shopVisits.length > 0) {
        const svData = shopVisits
          .map(sv => {
            const newShopId = shopIdMap.get(String(sv.shopId || ''));
            const newObId = userIdMap.get(String(sv.orderbookerId || ''));
            if (!newShopId || !newObId) return null;
            return {
              shopId: newShopId, orderbookerId: newObId,
              gpsLat: sv.gpsLat ? Number(sv.gpsLat) : null,
              gpsLng: sv.gpsLng ? Number(sv.gpsLng) : null,
              gpsAddress: sv.gpsAddress ? String(sv.gpsAddress) : null,
              inRange: Boolean(sv.inRange !== false),
              createdAt: sv.createdAt ? new Date(String(sv.createdAt)) : new Date(),
            };
          })
          .filter(Boolean) as { shopId: string; orderbookerId: string; gpsLat: number | null; gpsLng: number | null; gpsAddress: string | null; inRange: boolean; createdAt: Date }[];
        if (svData.length > 0) {
          await db.shopVisit.createMany({ data: svData });
          counts.shopVisits = svData.length;
        }
      }

      // AuditLogs (skip to save time)
      counts.auditLogs = 0;

      console.log(`[BACKUP-IMPORT] Merge import complete:`, counts, `skipped: ${shopsSkipped} shops, ${transactionsSkipped} transactions`);
    }

    return NextResponse.json({
      success: true,
      mode,
      message: `Backup import (${mode} mode) completed`,
      imported: counts,
      idMaps: {
        users: userIdMap.size,
        shops: shopIdMap.size,
        companies: companyIdMap.size,
      },
    }, { status: 200 });

  } catch (error) {
    console.error('[BACKUP-IMPORT] Error importing backup:', error);
    return NextResponse.json(
      { error: 'Failed to import backup: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// DELETE /api/backup — Backup info summary (record counts)
// ────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const [
      userCount, shopCount, transactionCount, auditLogCount,
      companyCount, shopCompanyBalanceCount, userCompanyCount,
      shopOrderbookerCount, dailyTargetCount, shopNoteCount, shopVisitCount,
    ] = await Promise.all([
      db.user.count(), db.shop.count(), db.transaction.count(), db.auditLog.count(),
      db.company.count(), db.shopCompanyBalance.count(), db.userCompany.count(),
      db.shopOrderbooker.count(), db.dailyTarget.count(), db.shopNote.count(), db.shopVisit.count(),
    ]);

    return NextResponse.json({
      tables: {
        users: { count: userCount, description: 'Admin and orderbooker accounts' },
        shops: { count: shopCount, description: 'Registered shops with route assignments' },
        transactions: { count: transactionCount, description: 'Credit postings and recovery entries' },
        auditLogs: { count: auditLogCount, description: 'Audit trail of all actions' },
        companies: { count: companyCount, description: 'Companies / distributors' },
        shopCompanyBalances: { count: shopCompanyBalanceCount, description: 'Per-shop per-company balances' },
        userCompanies: { count: userCompanyCount, description: 'User-company assignments' },
        shopOrderbookers: { count: shopOrderbookerCount, description: 'Shop-orderbooker assignments' },
        dailyTargets: { count: dailyTargetCount, description: 'Monthly recovery targets' },
        shopNotes: { count: shopNoteCount, description: 'Shop notes' },
        shopVisits: { count: shopVisitCount, description: 'GPS shop visits' },
      },
      summary: { totalRecords: userCount + shopCount + transactionCount + auditLogCount + companyCount + shopCompanyBalanceCount + userCompanyCount + shopOrderbookerCount + dailyTargetCount + shopNoteCount + shopVisitCount, totalTables: 11 },
    });
  } catch (error) {
    console.error('Error fetching backup info:', error);
    return NextResponse.json({ error: 'Failed to fetch backup info' }, { status: 500 });
  }
}
