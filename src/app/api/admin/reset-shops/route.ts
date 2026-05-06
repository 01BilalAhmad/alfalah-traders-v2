import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-guard';

// POST /api/admin/reset-shops - Delete all shops, transactions, and related data
// Keeps: Users (admin + orderbookers) and Companies intact
export async function POST(request: NextRequest) {
  // Verify admin access
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // Delete in reverse dependency order to respect foreign keys

      // 1. Delete all shop company balances (depends on shops + companies)
      const deletedBalances = await tx.shopCompanyBalance.deleteMany({});

      // 2. Delete all audit logs (references users, shops, etc.)
      const deletedAuditLogs = await tx.auditLog.deleteMany({});

      // 3. Delete all shop visits (depends on shops + users)
      const deletedVisits = await tx.shopVisit.deleteMany({});

      // 4. Delete all shop notes (depends on shops + users)
      const deletedNotes = await tx.shopNote.deleteMany({});

      // 5. Delete all transactions (depends on shops + users)
      const deletedTransactions = await tx.transaction.deleteMany({});

      // 6. Delete all shops (depends on users/orderbookers)
      const deletedShops = await tx.shop.deleteMany({});

      // 7. Delete daily targets (depends on users)
      const deletedTargets = await tx.dailyTarget.deleteMany({});

      // Users and Companies are KEPT intact
      const remainingUsers = await tx.user.count();
      const remainingCompanies = await tx.company.count();

      return {
        deleted: {
          shops: deletedShops.count,
          transactions: deletedTransactions.count,
          auditLogs: deletedAuditLogs.count,
          shopCompanyBalances: deletedBalances.count,
          shopVisits: deletedVisits.count,
          shopNotes: deletedNotes.count,
          dailyTargets: deletedTargets.count,
        },
        kept: {
          users: remainingUsers,
          companies: remainingCompanies,
        },
      };
    });

    return NextResponse.json({
      success: true,
      message: 'All shop data deleted successfully. Users and companies preserved.',
      ...result,
    }, { status: 200 });
  } catch (error) {
    console.error('Error resetting shop data:', error);
    return NextResponse.json(
      { error: 'Failed to reset shop data. Please try again.' },
      { status: 500 }
    );
  }
}
