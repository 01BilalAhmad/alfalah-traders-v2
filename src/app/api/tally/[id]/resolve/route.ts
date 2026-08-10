import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';
import { ensureTallyTables, RESOLUTION_TYPES, type ResolutionType } from '@/lib/tally-migrations';

// POST /api/tally/[id]/resolve
// Body: { resolutionType, resolutionNote? }
// Admin-only: marks an open discrepancy tally as resolved.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: tallyId } = await params;
    const body = await request.json();
    const { resolutionType, resolutionNote } = body;

    if (!resolutionType || !RESOLUTION_TYPES.includes(resolutionType as ResolutionType)) {
      return NextResponse.json({
        error: `Invalid resolutionType. Valid: ${RESOLUTION_TYPES.join(', ')}`,
      }, { status: 400 });
    }

    const pool = getPool();
    await ensureTallyTables();

    // Verify tally exists and is a discrepancy
    const tallyRes = await pool.query(
      `SELECT st.id, st.status, st."resolutionStatus", st."shopId", st."difference",
              s.name AS "shopName"
       FROM "ShopTally" st
       LEFT JOIN "Shop" s ON st."shopId" = s.id
       WHERE st.id = $1`,
      [tallyId]
    );
    if (tallyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Tally not found' }, { status: 404 });
    }
    const tally = tallyRes.rows[0];
    if (tally.status !== 'discrepancy') {
      return NextResponse.json({ error: 'Only discrepancy tallies can be resolved' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await pool.query(
      `UPDATE "ShopTally"
          SET "resolutionStatus" = 'resolved',
              "resolutionType" = $1,
              "resolutionNote" = $2,
              "resolvedBy" = $3,
              "resolvedAt" = $4
        WHERE id = $5`,
      [
        resolutionType,
        resolutionNote ? String(resolutionNote).slice(0, 1000) : null,
        auth.userId,
        now,
        tallyId,
      ]
    );

    // If adjustment_posted, automatically create an adjustment Transaction
    // to bring the system balance in line with the shopkeeper's stated balance.
    if (resolutionType === 'adjustment_posted') {
      try {
        const shopFresh = await pool.query(
          `SELECT id, balance FROM "Shop" WHERE id = $1`,
          [tally.shopId]
        );
        if (shopFresh.rows.length > 0) {
          const shop = shopFresh.rows[0];
          const currentBalance = Number(shop.balance) || 0;
          // We want to align system balance with what shopkeeper said.
          // Fetch the tally's shopBalance:
          const tbRes = await pool.query(
            `SELECT "shopBalance" FROM "ShopTally" WHERE id = $1`,
            [tallyId]
          );
          const targetBalance = Number(tbRes.rows[0]?.shopBalance) || currentBalance;
          const adjustmentAmount = Math.round((targetBalance - currentBalance) * 100) / 100;

          if (Math.abs(adjustmentAmount) >= 0.01) {
            const txnId = `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
            const txnType = adjustmentAmount < 0 ? 'recovery' : 'credit';
            // NOTE: status='approved' so it shows in ledger immediately.
            await pool.query(
              `INSERT INTO "Transaction"
                (id, "shopId", type, amount, "previousBalance", "newBalance",
                 description, status, "createdBy", "approvedBy", "approvedAt", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, $8, NOW(), NOW())`,
              [
                txnId,
                tally.shopId,
                txnType,
                Math.abs(adjustmentAmount),
                currentBalance,
                targetBalance,
                `Tally adjustment (tally ${tallyId}) — resolution: adjustment_posted`,
                auth.userId,
              ]
            );
            await pool.query(
              `UPDATE "Shop" SET balance = $1, "updatedAt" = NOW() WHERE id = $2`,
              [targetBalance, tally.shopId]
            );
          }
        }
      } catch (err) {
        console.error('[Tally resolve] adjustment transaction failed:', err);
        // Not blocking — the resolution itself succeeded.
      }
    }

    // Audit log
    try {
      const crypto = await import('crypto');
      const auditId = `audit_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "newValue", description)
         VALUES ($1, 'update', 'shopTally', $2, $3, $4)`,
        [
          auditId,
          tallyId,
          JSON.stringify({ resolutionType, resolutionNote, resolvedBy: auth.userId }),
          `Tally ${tallyId} for ${tally.shopName} resolved as ${resolutionType}`,
        ]
      );
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      tallyId,
      resolutionStatus: 'resolved',
      resolutionType,
      resolvedAt: now,
    });
  } catch (error) {
    console.error('[Tally Resolve API] error:', error);
    return NextResponse.json({ error: 'Failed to resolve tally' }, { status: 500 });
  }
}
