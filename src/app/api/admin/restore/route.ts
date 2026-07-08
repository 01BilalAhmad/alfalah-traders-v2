import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-guard';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// POST /api/admin/restore - Restores data from a backup JSON file (Admin only)
export async function POST(request: NextRequest) {
  // Verify admin access
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided. Please upload a backup JSON file.' }, { status: 400 });
    }

    if (!file.name.endsWith('.json')) {
      return NextResponse.json({ error: 'Invalid file type. Please upload a .json backup file.' }, { status: 400 });
    }

    const fileContent = await file.text();
    let backup: Record<string, unknown>;

    try {
      backup = JSON.parse(fileContent);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON file. The backup file appears to be corrupted.' }, { status: 400 });
    }

    // Validate backup structure
    const metadata = backup.metadata as Record<string, unknown> | undefined;
    const data = backup.data as Record<string, unknown> | undefined;

    if (!metadata || !data) {
      return NextResponse.json({
        error: 'Invalid backup format. Missing metadata or data sections.',
      }, { status: 400 });
    }

    if (!metadata.exportDate || !Array.isArray(data.users) || !Array.isArray(data.shops)) {
      return NextResponse.json({
        error: 'Invalid backup format. Required fields: metadata.exportDate, data.users, data.shops',
      }, { status: 400 });
    }

    const users = data.users as Record<string, unknown>[];
    const shops = data.shops as Record<string, unknown>[];
    const transactions = (data.transactions || []) as Record<string, unknown>[];
    const auditLogs = (data.auditLogs || []) as Record<string, unknown>[];

    // Create a preview without actually restoring
    const preview = {
      users: users.length,
      shops: shops.length,
      transactions: transactions.length,
      auditLogs: auditLogs.length,
      exportDate: metadata.exportDate,
    };

    // If this is a preview request, return counts without restoring
    const isPreview = request.headers.get('X-Restore-Preview') === 'true';
    if (isPreview) {
      return NextResponse.json({ preview });
    }

    // Perform atomic restore using Prisma transaction
    const result = await db.$transaction(async (tx) => {
      // 1. Clear existing data in reverse dependency order
      await tx.auditLog.deleteMany({});
      await tx.transaction.deleteMany({});
      await tx.shop.deleteMany({});

      // Keep the admin user, but clear orderbookers
      await tx.user.deleteMany({
        where: { role: 'orderbooker' },
      });

      // 2. Import users (skip admin users to preserve current admin)
      // SECURITY: Backup exports exclude password hashes.
      // For restored users, generate a random temporary password so they can't
      // be logged into with an empty string. Admin should trigger password resets.
      let importedUsers = 0;
      const resetNeededUsers: string[] = [];
      for (const user of users) {
        if (user.role === 'admin') continue; // Skip admin users

        // If backup has a valid bcrypt hash, use it; otherwise generate a random one
        let passwordHash: string;
        if (user.password && typeof user.password === 'string' && user.password.startsWith('$2')) {
          passwordHash = user.password; // Valid bcrypt hash from old backup
        } else {
          // No password in backup — generate random temp password and hash it
          const tempPassword = crypto.randomBytes(32).toString('hex');
          passwordHash = await bcrypt.hash(tempPassword, 10);
          resetNeededUsers.push(String(user.username || 'unknown'));
        }

        await tx.user.create({
          data: {
            username: String(user.username || ''),
            password: passwordHash,
            name: String(user.name || ''),
            role: String(user.role || 'orderbooker'),
            phone: user.phone ? String(user.phone) : null,
            status: String(user.status || 'active'),
          },
        });
        importedUsers++;
      }

      // Build a map of old userId -> new userId for reference mapping
      const userIdMap = new Map<string, string>();
      const importedUserRecords = await tx.user.findMany({
        where: { role: 'orderbooker' },
        select: { id: true, username: true, name: true },
        orderBy: { createdAt: 'asc' },
      });

      // Match old users to new users by username (since IDs will differ)
      for (const oldUser of users) {
        if (oldUser.role === 'admin') continue;
        const match = importedUserRecords.find(
          (u) => u.username === String(oldUser.username)
        );
        if (match && oldUser.id) {
          userIdMap.set(String(oldUser.id), match.id);
        }
      }

      // 3. Import shops with mapped orderbooker IDs
      let importedShops = 0;
      for (const shop of shops) {
        const oldObId = String(shop.orderbookerId || '');
        const newObId = userIdMap.get(oldObId);

        if (!newObId) continue; // Skip shops with unmapped orderbooker

        await tx.shop.create({
          data: {
            name: String(shop.name || ''),
            ownerName: shop.ownerName ? String(shop.ownerName) : null,
            area: shop.area ? String(shop.area) : null,
            address: shop.address ? String(shop.address) : null,
            phone: shop.phone ? String(shop.phone) : null,
            routeDays: Array.isArray(shop.routeDays) ? shop.routeDays : (shop.routeDay ? [String(shop.routeDay)] : ['monday']),
            orderbookerId: newObId,
            balance: Number(shop.balance || 0),
            creditLimit: Number(shop.creditLimit || 0),
            status: String(shop.status || 'active'),
          },
        });
        importedShops++;
      }

      // Build shop ID map
      const shopIdMap = new Map<string, string>();
      const importedShopRecords = await tx.shop.findMany({
        select: { id: true, name: true, orderbookerId: true },
        orderBy: { createdAt: 'asc' },
      });

      for (const oldShop of shops) {
        if (!oldShop.id) continue;
        const oldObId = String(oldShop.orderbookerId || '');
        const newObId = userIdMap.get(oldObId);
        if (!newObId) continue;

        const match = importedShopRecords.find(
          (s) => s.name === String(oldShop.name) && s.orderbookerId === newObId
        );
        if (match) {
          shopIdMap.set(String(oldShop.id), match.id);
        }
      }

      // 4. Import transactions
      let importedTransactions = 0;
      for (const txn of transactions) {
        const newShopId = shopIdMap.get(String(txn.shopId || ''));
        const newCreatorId = userIdMap.get(String(txn.createdBy || ''));

        if (!newShopId || !newCreatorId) continue;

        await tx.transaction.create({
          data: {
            shopId: newShopId,
            type: String(txn.type || 'credit'),
            amount: Number(txn.amount || 0),
            previousBalance: Number(txn.previousBalance || 0),
            newBalance: Number(txn.newBalance || 0),
            description: txn.description ? String(txn.description) : null,
            createdBy: newCreatorId,
            gpsLat: txn.gpsLat ? Number(txn.gpsLat) : null,
            gpsLng: txn.gpsLng ? Number(txn.gpsLng) : null,
            gpsAddress: txn.gpsAddress ? String(txn.gpsAddress) : null,
            createdAt: txn.createdAt ? new Date(String(txn.createdAt)) : new Date(),
          },
        });
        importedTransactions++;
      }

      // 5. Import audit logs
      let importedAuditLogs = 0;
      for (const log of auditLogs) {
        const newPerformerId = userIdMap.get(String(log.performedBy || ''));

        if (!newPerformerId) continue;

        await tx.auditLog.create({
          data: {
            action: String(log.action || ''),
            entityType: String(log.entityType || ''),
            entityId: log.entityId ? String(log.entityId) : null,
            performedBy: newPerformerId,
            oldValue: log.oldValue ? String(log.oldValue) : null,
            newValue: log.newValue ? String(log.newValue) : null,
            description: log.description ? String(log.description) : null,
            createdAt: log.createdAt ? new Date(String(log.createdAt)) : new Date(),
          },
        });
        importedAuditLogs++;
      }

      return {
        success: true,
        imported: {
          users: importedUsers,
          shops: importedShops,
          transactions: importedTransactions,
          auditLogs: importedAuditLogs,
        },
        // SECURITY: Inform admin which users need password resets
        // (because backup excluded password hashes)
        passwordResetNeeded: resetNeededUsers.length > 0 ? resetNeededUsers : undefined,
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error restoring backup:', error);
    return NextResponse.json({ error: 'Failed to restore backup. The data may be in an inconsistent state.' }, { status: 500 });
  }
}
