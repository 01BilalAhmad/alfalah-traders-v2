import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────
// Credit Closing Target API
// ─────────────────────────────────────────────────────────────────────────
// The orderbooker must bring their total outstanding credit balance down
// to `targetClosingCredit` by end of month.
//
// `openingCredit` is auto-set from previous month's closing balance
// (or current sum of Shop.balance on 1st of month if no previous target).
// Admin can also manually edit opening/target.
//
// POST /api/users/:id/credit-target
//   Body: { month: "YYYY-MM", targetClosingCredit: number, openingCredit?: number }
//   - If openingCredit not provided, auto-calculate from prev month or current balance
//
// GET /api/users/:id/credit-target?month=YYYY-MM
//   Returns: target + live stats (current credit, recovery done, progress, etc.)
//
// DELETE /api/users/:id/credit-target?month=YYYY-MM
// ─────────────────────────────────────────────────────────────────────────

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPreviousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Get sum of Shop.balance for all shops assigned to this orderbooker
async function getOBCreditBalance(pool: any, orderbookerId: string): Promise<number> {
  const res = await pool.query(
    `SELECT COALESCE(SUM(s.balance), 0) AS total
     FROM "Shop" s
     WHERE s."orderbookerId" = $1 AND s.status = 'active'`,
    [orderbookerId]
  );
  return Number(res.rows[0]?.total || 0);
}

// Get sum of approved recoveries for this OB in a specific month
async function getOBRecoveryForMonth(pool: any, orderbookerId: string, month: string): Promise<number> {
  const [year, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, m - 1, 1, -5, 0, 0, 0)); // PKT 00:00 = UTC 19:00 prev day
  const end = new Date(Date.UTC(year, m, 1, -5, 0, 0, 0));

  const res = await pool.query(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
     FROM "Transaction" t
     WHERE t."createdBy" = $1
       AND t.type = 'recovery'
       AND t.status = 'approved'
       AND t."createdAt" >= $2
       AND t."createdAt" < $3`,
    [orderbookerId, start.toISOString(), end.toISOString()]
  );
  return Number(res.rows[0]?.total || 0);
}

// GET — fetch target + live stats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || getCurrentMonth();

    const pool = getPool();

    // 1. Fetch target for this month
    const targetRes = await pool.query(
      `SELECT * FROM "DailyTarget" WHERE "orderbookerId" = $1 AND month = $2`,
      [userId, month]
    );
    const targetRow = targetRes.rows[0];

    // 2. Get current credit balance (live)
    const currentCredit = await getOBCreditBalance(pool, userId);

    // 3. Get recovery done this month
    const recoveryDone = await getOBRecoveryForMonth(pool, userId, month);

    // 4. Get previous month's closing (for opening auto-carry)
    const prevMonth = getPreviousMonth(month);
    const prevTargetRes = await pool.query(
      `SELECT "closingCredit", "targetClosingCredit" FROM "DailyTarget"
       WHERE "orderbookerId" = $1 AND month = $2`,
      [userId, prevMonth]
    );
    const prevClosing = prevTargetRes.rows[0]?.closingCredit
      ? Number(prevTargetRes.rows[0].closingCredit)
      : null;

    // 5. Compute auto-opening if not set
    let openingCredit = targetRow?.openingCredit ? Number(targetRow.openingCredit) : null;
    if (openingCredit === null) {
      openingCredit = prevClosing !== null ? prevClosing : currentCredit;
    }

    // 6. Compute max credit this month (stored or fallback)
    const maxCreditThisMonth = targetRow?.maxCreditThisMonth
      ? Number(targetRow.maxCreditThisMonth)
      : Math.max(openingCredit, currentCredit);

    // 7. Compute progress
    const targetClosing = targetRow?.targetClosingCredit ? Number(targetRow.targetClosingCredit) : null;
    let progress = 0;
    let recoveryNeeded = 0;
    let status = 'no_target';

    if (targetClosing !== null) {
      const totalReductionNeeded = maxCreditThisMonth - targetClosing;
      const reductionAchieved = maxCreditThisMonth - currentCredit;
      if (totalReductionNeeded > 0) {
        progress = Math.max(0, Math.min(100, Math.round((reductionAchieved / totalReductionNeeded) * 100)));
      } else {
        progress = 100;
      }
      recoveryNeeded = Math.max(0, currentCredit - targetClosing);

      if (currentCredit <= targetClosing) status = 'achieved';
      else if (progress >= 80) status = 'on_track';
      else if (progress >= 50) status = 'behind';
      else status = 'critical';
    }

    return NextResponse.json({
      target: targetRow ? {
        id: targetRow.id,
        month: targetRow.month,
        openingCredit,
        targetClosingCredit: targetClosing,
        maxCreditThisMonth,
        closingCredit: targetRow.closingCredit ? Number(targetRow.closingCredit) : null,
        recoveryTarget: targetRow.target ? Number(targetRow.target) : null,
      } : null,
      stats: {
        currentCredit,
        recoveryDone,
        recoveryNeeded,
        progress,
        status,
        prevMonthClosing: prevClosing,
      },
    });
  } catch (error) {
    console.error('Error fetching credit target:', error);
    return NextResponse.json({ error: 'Failed to fetch credit target' }, { status: 500 });
  }
}

// POST — set or update credit target
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderbookerId } = await params;
    const createdBy = request.headers.get('x-auth-userid');
    const body = await request.json();
    const { month, targetClosingCredit, openingCredit, recoveryTarget } = body;

    if (!month || !createdBy) {
      return NextResponse.json({ error: 'month and authentication are required' }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month must be in YYYY-MM format' }, { status: 400 });
    }

    if (targetClosingCredit === undefined || targetClosingCredit === null || targetClosingCredit < 0) {
      return NextResponse.json({ error: 'targetClosingCredit must be >= 0' }, { status: 400 });
    }

    const pool = getPool();

    // Auto-calculate opening if not provided
    let finalOpeningCredit = openingCredit;
    if (finalOpeningCredit === undefined || finalOpeningCredit === null) {
      const prevMonth = getPreviousMonth(month);
      const prevRes = await pool.query(
        `SELECT "closingCredit" FROM "DailyTarget"
         WHERE "orderbookerId" = $1 AND month = $2`,
        [orderbookerId, prevMonth]
      );
      if (prevRes.rows[0]?.closingCredit) {
        finalOpeningCredit = Number(prevRes.rows[0].closingCredit);
      } else {
        finalOpeningCredit = await getOBCreditBalance(pool, orderbookerId);
      }
    }

    // Upsert
    const existingRes = await pool.query(
      'SELECT id FROM "DailyTarget" WHERE "orderbookerId" = $1 AND month = $2',
      [orderbookerId, month]
    );

    const legacyTarget = recoveryTarget || 0;

    let result;
    if (existingRes.rows.length > 0) {
      const updateRes = await pool.query(
        `UPDATE "DailyTarget"
         SET "targetClosingCredit" = $1,
             "openingCredit" = $2,
             target = $3,
             "createdBy" = $4,
             "updatedAt" = NOW()
         WHERE "orderbookerId" = $5 AND month = $6
         RETURNING *`,
        [targetClosingCredit, finalOpeningCredit, legacyTarget, createdBy, orderbookerId, month]
      );
      result = updateRes.rows[0];
    } else {
      const targetId = `target_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
      const insertRes = await pool.query(
        `INSERT INTO "DailyTarget"
         (id, "orderbookerId", target, month, "createdBy", "createdAt", "updatedAt",
          "openingCredit", "targetClosingCredit")
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, $7)
         RETURNING *`,
        [targetId, orderbookerId, legacyTarget, month, createdBy, finalOpeningCredit, targetClosingCredit]
      );
      result = insertRes.rows[0];
    }

    return NextResponse.json({
      id: result.id,
      orderbookerId: result.orderbookerId,
      month: result.month,
      openingCredit: result.openingCredit ? Number(result.openingCredit) : null,
      targetClosingCredit: result.targetClosingCredit ? Number(result.targetClosingCredit) : null,
      recoveryTarget: result.target ? Number(result.target) : null,
      message: 'Credit target saved successfully',
    });
  } catch (error) {
    console.error('Error saving credit target:', error);
    return NextResponse.json({ error: 'Failed to save credit target' }, { status: 500 });
  }
}

// DELETE
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderbookerId } = await params;
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    if (!month) {
      return NextResponse.json({ error: 'month query param is required' }, { status: 400 });
    }

    const pool = getPool();
    const deleteRes = await pool.query(
      'DELETE FROM "DailyTarget" WHERE "orderbookerId" = $1 AND month = $2 RETURNING id',
      [orderbookerId, month]
    );

    if (deleteRes.rows.length === 0) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting credit target:', error);
    return NextResponse.json({ error: 'Failed to delete target' }, { status: 500 });
  }
}
