import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';

// POST /api/auth/login — Raw pg login (no Prisma)
export async function POST(request: Request) {
  try {
    const pool = getPool();

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const res = await pool.query(
      'SELECT u.id, u.username, u.name, u.role, u.phone, u.status, u.password, u."createdAt", u."allRoutesEnabled", u."companyId", c.name AS "companyName" FROM "User" u LEFT JOIN "Company" c ON u."companyId" = c.id WHERE LOWER(u.username) = $1',
      [normalizedUsername]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = res.rows[0];

    if (user.status === 'inactive') {
      return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 });
    }

    // Verify password with bcrypt
    const bcrypt = await import('bcryptjs');
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Fetch user's companies from UserCompany junction table
    let userCompanies: { companyId: string; companyName: string; isPrimary: boolean }[] = [];
    try {
      const ucRes = await pool.query(
        `SELECT uc."companyId", uc."isPrimary", c.name AS "companyName"
         FROM "UserCompany" uc
         JOIN "Company" c ON uc."companyId" = c.id
         WHERE uc."userId" = $1 AND c.status = 'active'
         ORDER BY uc."isPrimary" DESC, c.name ASC`,
        [user.id]
      );
      userCompanies = ucRes.rows.map((row: any) => ({
        companyId: row.companyId,
        companyName: row.companyName,
        isPrimary: row.isPrimary,
      }));
    } catch {
      // UserCompany table might not exist yet (migration in progress)
      // Fallback: derive from User.companyId
    }

    // Fallback: if no UserCompany records, derive from User.companyId + ShopOrderbooker
    if (userCompanies.length === 0 && user.companyId) {
      // Add primary company from User.companyId
      const primaryCompany = await pool.query(
        'SELECT id, name FROM "Company" WHERE id = $1 AND status = \'active\'',
        [user.companyId]
      );
      if (primaryCompany.rows.length > 0) {
        userCompanies.push({
          companyId: primaryCompany.rows[0].id,
          companyName: primaryCompany.rows[0].name,
          isPrimary: true,
        });
      }

      // Add secondary companies from ShopOrderbooker
      try {
        const soRes = await pool.query(
          `SELECT DISTINCT so."companyId", c.name AS "companyName"
           FROM "ShopOrderbooker" so
           JOIN "Company" c ON so."companyId" = c.id
           WHERE so."orderbookerId" = $1 AND c.status = 'active' AND so."companyId" != $2`,
          [user.id, user.companyId]
        );
        for (const row of soRes.rows) {
          userCompanies.push({
            companyId: row.companyId,
            companyName: row.companyName,
            isPrimary: false,
          });
        }
      } catch { /* ShopOrderbooker might not exist */ }
    }

    const { password: _, ...safeUser } = user;
    // Attach companies array to user object
    (safeUser as any).companies = userCompanies;

    return NextResponse.json({ user: safeUser, token: `session-${user.id}-${Date.now()}` });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Login error:', msg, error instanceof Error ? error.stack : '');
    // In development, show the real error message for easier debugging
    const errorMsg = process.env.NODE_ENV === 'development'
      ? `Internal server error: ${msg}`
      : 'Internal server error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
