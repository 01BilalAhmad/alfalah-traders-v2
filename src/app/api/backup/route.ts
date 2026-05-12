import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ────────────────────────────────────────────────────────────
// GET /api/backup — Export all data as a JSON backup
// ────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const [users, shops, transactions, auditLogs] = await Promise.all([
      db.user.findMany({
        select: {
          id: true,
          username: true,
          name: true,
          role: true,
          phone: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.shop.findMany({
        select: {
          id: true,
          name: true,
          ownerName: true,
          area: true,
          address: true,
          phone: true,
          routeDays: true,
          orderbookerId: true,
          balance: true,
          creditLimit: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.transaction.findMany({
        select: {
          id: true,
          shopId: true,
          type: true,
          amount: true,
          previousBalance: true,
          newBalance: true,
          description: true,
          createdBy: true,
          gpsLat: true,
          gpsLng: true,
          gpsAddress: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.auditLog.findMany({
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          performedBy: true,
          oldValue: true,
          newValue: true,
          description: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      metadata: {
        application: 'Finexa - Smart Credit Management',
        counts: {
          users: users.length,
          shops: shops.length,
          transactions: transactions.length,
          auditLogs: auditLogs.length,
        },
        totalRecords: users.length + shops.length + transactions.length + auditLogs.length,
      },
      data: {
        users,
        shops,
        transactions,
        auditLogs,
      },
    };

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error creating backup export:', error);
    return NextResponse.json(
      { error: 'Failed to export backup data' },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// POST /api/backup — Import / Restore data from a JSON backup
// ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // --- Validate backup structure ---
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body — expected a JSON object' },
        { status: 400 }
      );
    }

    if (!body.data || typeof body.data !== 'object') {
      return NextResponse.json(
        { error: 'Invalid backup format — missing "data" section' },
        { status: 400 }
      );
    }

    const { users, shops, transactions, auditLogs } = body.data;

    // Users and Shops are required at minimum
    if (!Array.isArray(users) || !Array.isArray(shops)) {
      return NextResponse.json(
        { error: 'Invalid backup format — "data.users" and "data.shops" must be arrays' },
        { status: 400 }
      );
    }

    const txns = Array.isArray(transactions) ? transactions : [];
    const logs = Array.isArray(auditLogs) ? auditLogs : [];

    // --- Import data inside a Prisma transaction ---
    const result = await db.$transaction(async (tx) => {
      // ---- 1. Users — upsert by username ----
      let usersImported = 0;
      let usersSkipped = 0;

      for (const user of users) {
        if (!user.username) {
          usersSkipped++;
          continue;
        }

        const existing = await tx.user.findUnique({
          where: { username: user.username },
        });

        if (existing) {
          usersSkipped++;
        } else {
          await tx.user.create({
            data: {
              username: user.username,
              password: user.password || 'changeme123',
              name: user.name || user.username,
              role: user.role || 'orderbooker',
              phone: user.phone || null,
              status: user.status || 'active',
            },
          });
          usersImported++;
        }
      }

      // ---- 2. Shops — upsert by id ----
      let shopsImported = 0;
      let shopsSkipped = 0;

      for (const shop of shops) {
        if (!shop.id || !shop.name) {
          shopsSkipped++;
          continue;
        }

        const existing = await tx.shop.findUnique({
          where: { id: shop.id },
        });

        if (existing) {
          shopsSkipped++;
        } else {
          // Ensure the orderbooker exists
          const obExists = await tx.user.findUnique({
            where: { id: shop.orderbookerId },
          });

          if (!obExists) {
            shopsSkipped++;
            continue;
          }

          await tx.shop.create({
            data: {
              id: shop.id,
              name: shop.name,
              ownerName: shop.ownerName || null,
              area: shop.area || null,
              address: shop.address || null,
              phone: shop.phone || null,
              routeDays: shop.routeDays || (shop.routeDay ? [shop.routeDay] : ['monday']),
              orderbookerId: shop.orderbookerId,
              balance: shop.balance || 0,
              creditLimit: shop.creditLimit || 0,
              status: shop.status || 'active',
            },
          });
          shopsImported++;
        }
      }

      // ---- 3. Transactions — create if not exists ----
      let transactionsImported = 0;
      let transactionsSkipped = 0;

      for (const txn of txns) {
        if (!txn.id) {
          transactionsSkipped++;
          continue;
        }

        const existing = await tx.transaction.findUnique({
          where: { id: txn.id },
        });

        if (existing) {
          transactionsSkipped++;
        } else {
          // Verify referenced shop and user exist
          const shopExists = await tx.shop.findUnique({
            where: { id: txn.shopId },
          });

          const userExists = await tx.user.findUnique({
            where: { id: txn.createdBy },
          });

          if (!shopExists || !userExists) {
            transactionsSkipped++;
            continue;
          }

          await tx.transaction.create({
            data: {
              id: txn.id,
              shopId: txn.shopId,
              type: txn.type || 'credit',
              amount: txn.amount || 0,
              previousBalance: txn.previousBalance || 0,
              newBalance: txn.newBalance || 0,
              description: txn.description || null,
              createdBy: txn.createdBy,
              gpsLat: txn.gpsLat ?? null,
              gpsLng: txn.gpsLng ?? null,
              gpsAddress: txn.gpsAddress || null,
              createdAt: txn.createdAt ? new Date(txn.createdAt) : new Date(),
            },
          });
          transactionsImported++;
        }
      }

      // ---- 4. AuditLogs — create if not exists ----
      let auditLogsImported = 0;
      let auditLogsSkipped = 0;

      for (const log of logs) {
        if (!log.id) {
          auditLogsSkipped++;
          continue;
        }

        const existing = await tx.auditLog.findUnique({
          where: { id: log.id },
        });

        if (existing) {
          auditLogsSkipped++;
        } else {
          // Verify performer exists
          const userExists = await tx.user.findUnique({
            where: { id: log.performedBy },
          });

          if (!userExists) {
            auditLogsSkipped++;
            continue;
          }

          await tx.auditLog.create({
            data: {
              id: log.id,
              action: log.action || '',
              entityType: log.entityType || '',
              entityId: log.entityId || null,
              performedBy: log.performedBy,
              oldValue: log.oldValue || null,
              newValue: log.newValue || null,
              description: log.description || null,
              createdAt: log.createdAt ? new Date(log.createdAt) : new Date(),
            },
          });
          auditLogsImported++;
        }
      }

      return {
        success: true,
        message: 'Backup import completed',
        imported: {
          users: usersImported,
          shops: shopsImported,
          transactions: transactionsImported,
          auditLogs: auditLogsImported,
        },
        skipped: {
          users: usersSkipped,
          shops: shopsSkipped,
          transactions: transactionsSkipped,
          auditLogs: auditLogsSkipped,
        },
        totalImported: usersImported + shopsImported + transactionsImported + auditLogsImported,
        totalSkipped: usersSkipped + shopsSkipped + transactionsSkipped + auditLogsSkipped,
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error importing backup:', error);
    return NextResponse.json(
      { error: 'Failed to import backup data. The data may be in an inconsistent state.' },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// DELETE /api/backup — Backup info summary (record counts)
// ────────────────────────────────────────────────────────────
export async function DELETE() {
  try {
    const [userCount, shopCount, transactionCount, auditLogCount] = await Promise.all([
      db.user.count(),
      db.shop.count(),
      db.transaction.count(),
      db.auditLog.count(),
    ]);

    const totalRecords = userCount + shopCount + transactionCount + auditLogCount;

    return NextResponse.json({
      tables: {
        users: {
          count: userCount,
          description: 'Admin and orderbooker accounts',
        },
        shops: {
          count: shopCount,
          description: 'Registered shops with route assignments',
        },
        transactions: {
          count: transactionCount,
          description: 'Credit postings and recovery entries',
        },
        auditLogs: {
          count: auditLogCount,
          description: 'Audit trail of all actions',
        },
      },
      summary: {
        totalRecords,
        totalTables: 4,
      },
    });
  } catch (error) {
    console.error('Error fetching backup info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch backup info' },
      { status: 500 }
    );
  }
}
