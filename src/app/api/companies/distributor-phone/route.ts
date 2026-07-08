import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { requireAuth } from '@/lib/auth-guard';

// GET /api/companies/distributor-phone?companyId=xxx
// Mobile app calls this to get the distributor phone for receipts
// SECURITY: Requires authentication — distributor phone is business PII
export async function GET(request: NextRequest) {
  // SECURITY: Handler-level auth check (defense-in-depth)
  const auth = await requireAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    const pool = getPool();

    let query: string;
    let params: string[];

    if (companyId) {
      query = 'SELECT id, name, "distributorPhone" FROM "Company" WHERE id = $1 AND status = $2';
      params = [companyId, 'active'];
    } else {
      query = 'SELECT id, name, "distributorPhone" FROM "Company" WHERE status = $1 ORDER BY "createdAt" ASC LIMIT 1';
      params = ['active'];
    }

    const res = await pool.query(query, params);

    if (res.rows.length === 0) {
      return NextResponse.json({ distributorPhone: null, companyName: null });
    }

    const company = res.rows[0];
    return NextResponse.json({
      distributorPhone: company.distributorPhone || null,
      companyName: company.name || null,
      companyId: company.id,
    });
  } catch (error) {
    console.error('Error fetching distributor phone:', error);
    return NextResponse.json({ distributorPhone: null, companyName: null }, { status: 500 });
  }
}
