import { NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import { generateToken } from '@/lib/jwt';

// POST /api/orderbooker/login
// Mobile-specific login endpoint for Finexa OB App.
// Returns { success: true, user, token } format expected by the mobile app.
// Only allows orderbooker role users.
export async function POST(request: Request) {
  try {
    const pool = getPool();

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: 'Username and password are required' },
        { status: 400 },
      );
    }

    const normalizedUsername = username.trim().toLowerCase();

    // Find user by username
    const res = await pool.query(
      `SELECT u.id, u.username, u.name, u.role, u.phone, u.status, u.password,
              u."companyId", c.name AS "companyName", c."distributorPhone"
       FROM "User" u
       LEFT JOIN "Company" c ON u."companyId" = c.id
       WHERE LOWER(u.username) = $1`,
      [normalizedUsername],
    );

    if (res.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid credentials' },
        { status: 401 },
      );
    }

    const dbUser = res.rows[0];

    // Only allow orderbooker role
    if (dbUser.role !== 'orderbooker') {
      return NextResponse.json(
        { success: false, message: 'This app is for orderbookers only. Admin users must use the web dashboard.' },
        { status: 403 },
      );
    }

    // Check if account is active
    if (dbUser.status === 'inactive') {
      return NextResponse.json(
        { success: false, message: 'Account is deactivated. Contact your administrator.' },
        { status: 403 },
      );
    }

    // Verify password with bcrypt
    const bcrypt = await import('bcryptjs');
    const isValid = await bcrypt.compare(password, dbUser.password);
    if (!isValid) {
      return NextResponse.json(
        { success: false, message: 'Invalid credentials' },
        { status: 401 },
      );
    }

    // Fetch user's companies from UserCompany junction table
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
        [dbUser.id],
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

    // Fallback: derive from User.companyId if no UserCompany records
    if (userCompanies.length === 0 && dbUser.companyId) {
      const primaryCompany = await pool.query(
        'SELECT id, name, "distributorPhone" FROM "Company" WHERE id = $1 AND status = \'active\'',
        [dbUser.companyId],
      );
      if (primaryCompany.rows.length > 0) {
        userCompanies.push({
          companyId: primaryCompany.rows[0].id,
          companyName: primaryCompany.rows[0].name,
          distributorPhone: primaryCompany.rows[0].distributorPhone || null,
          isPrimary: true,
        });
      }

      // Add secondary companies from ShopOrderbooker
      try {
        const soRes = await pool.query(
          `SELECT DISTINCT so."companyId", c.name AS "companyName", c."distributorPhone"
           FROM "ShopOrderbooker" so
           JOIN "Company" c ON so."companyId" = c.id
           WHERE so."orderbookerId" = $1 AND c.status = 'active' AND so."companyId" != $2`,
          [dbUser.id, dbUser.companyId],
        );
        for (const row of soRes.rows) {
          userCompanies.push({
            companyId: row.companyId,
            companyName: row.companyName,
            distributorPhone: row.distributorPhone || null,
            isPrimary: false,
          });
        }
      } catch {
        // ShopOrderbooker might not exist
      }
    }

    // Determine primary company info for the mobile app user object
    const primaryCompany = userCompanies.find((c) => c.isPrimary) || userCompanies[0] || null;

    // Build the mobile-friendly user object matching the app's User type
    const user = {
      id: dbUser.id,
      username: dbUser.username,
      name: dbUser.name,
      phone: dbUser.phone || undefined,
      role: dbUser.role,
      companyId: primaryCompany?.companyId || dbUser.companyId || '',
      companyName: primaryCompany?.companyName || dbUser.companyName || '',
      distributorName: primaryCompany?.companyName || dbUser.companyName || '',
      distributorPhone: primaryCompany?.distributorPhone || dbUser.distributorPhone || undefined,
      companies: userCompanies,
    };

    // SECURITY: Generate signed JWT token instead of insecure session-{userId}-{timestamp}
    const token = generateToken(dbUser.id, dbUser.role);

    return NextResponse.json({
      success: true,
      user,
      token,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Orderbooker login error:', msg, error instanceof Error ? error.stack : '');
    const errorMsg =
      process.env.NODE_ENV === 'development'
        ? `Internal server error: ${msg}`
        : 'Internal server error';
    return NextResponse.json(
      { success: false, message: errorMsg },
      { status: 500 },
    );
  }
}
