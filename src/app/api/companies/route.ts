import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/companies - List all companies
// GET /api/companies?userId=xxx - Get companies assigned to a specific user (orderbooker)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const userId = searchParams.get('userId');

    // If userId is provided, return companies assigned to this user (for the mobile app)
    if (userId) {
      // PRIMARY SOURCE: Get companies from UserCompany junction table (direct assignments)
      const userCompanyRecords = await db.userCompany.findMany({
        where: { userId },
        select: {
          companyId: true,
          isPrimary: true,
          company: { select: { id: true, name: true, status: true, distributorPhone: true } },
        },
        orderBy: [{ isPrimary: 'desc' }, { companyId: 'asc' }],
      });

      const userCompanies: { id: string; companyId: string; companyName: string; isPrimary: boolean }[] = [];

      // Add companies from UserCompany junction table
      for (const uc of userCompanyRecords) {
        if (uc.company && uc.company.status === 'active') {
          userCompanies.push({
            id: `uc_${uc.company.id}`,
            companyId: uc.company.id,
            companyName: uc.company.name,
            isPrimary: uc.isPrimary,
          });
        }
      }

      // FALLBACK: If no UserCompany records exist yet (migration in progress),
      // derive from User.companyId + ShopOrderbooker assignments
      if (userCompanies.length === 0) {
        // Get the user's primary company
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { companyId: true, company: { select: { id: true, name: true, status: true, distributorPhone: true } } },
        });

        // Add primary company if exists
        if (user?.company && user.company.status === 'active') {
          userCompanies.push({
            id: `uc_${user.company.id}`,
            companyId: user.company.id,
            companyName: user.company.name,
            isPrimary: true,
          });
        }

        // Add secondary companies from ShopOrderbooker assignments
        const assignments = await db.shopOrderbooker.findMany({
          where: { orderbookerId: userId },
          select: {
            companyId: true,
            company: { select: { id: true, name: true, status: true, distributorPhone: true } },
          },
          distinct: ['companyId'],
        });

        for (const assignment of assignments) {
          if (assignment.company && assignment.company.status === 'active') {
            if (!userCompanies.find((uc) => uc.companyId === assignment.company!.id)) {
              userCompanies.push({
                id: `uc_${assignment.company.id}`,
                companyId: assignment.company.id,
                companyName: assignment.company.name,
                isPrimary: false,
              });
            }
          }
        }
      }

      return NextResponse.json(userCompanies);
    }

    // Default: list all companies (for admin panel)
    const where: any = {};
    if (status) where.status = status;

    const companies = await db.company.findMany({
      where,
      include: {
        _count: {
          select: {
            orderbookers: true,
            companyBalances: true,
            transactions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ companies });
  } catch (error: any) {
    console.error('Failed to fetch companies:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch companies' }, { status: 500 });
  }
}

// POST /api/companies - Create a new company
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, status, distributorPhone } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    // Check if company with same name already exists
    const existing = await db.company.findUnique({
      where: { name: name.trim() },
    });

    if (existing) {
      return NextResponse.json({ error: 'Company with this name already exists' }, { status: 409 });
    }

    const company = await db.company.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        distributorPhone: distributorPhone?.trim() || null,
        status: status || 'active',
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'create',
        entityType: 'company',
        entityId: company.id,
        newValue: JSON.stringify(company),
        description: `Company "${company.name}" created`,
      },
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create company:', error);
    return NextResponse.json({ error: error.message || 'Failed to create company' }, { status: 500 });
  }
}
