import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/companies - List all companies
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: any = {};
    if (status) where.status = status;

    const companies = await prisma.company.findMany({
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
    const { name, description, status } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    // Check if company with same name already exists
    const existing = await prisma.company.findUnique({
      where: { name: name.trim() },
    });

    if (existing) {
      return NextResponse.json({ error: 'Company with this name already exists' }, { status: 409 });
    }

    const company = await prisma.company.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        status: status || 'active',
      },
    });

    // Audit log
    await prisma.auditLog.create({
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
