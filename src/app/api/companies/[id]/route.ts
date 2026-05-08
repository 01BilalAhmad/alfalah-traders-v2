import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/companies/[id] - Get single company
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const company = await db.company.findUnique({
      where: { id },
      include: {
        orderbookers: {
          select: { id: true, name: true, username: true, phone: true, status: true },
        },
        _count: {
          select: {
            companyBalances: true,
            transactions: true,
          },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json({ company });
  } catch (error: any) {
    console.error('Failed to fetch company:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch company' }, { status: 500 });
  }
}

// PUT /api/companies/[id] - Update company
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, status, distributorPhone } = body;

    const existing = await db.company.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // If name is being changed, check for duplicates
    if (name && name.trim() !== existing.name) {
      const duplicate = await db.company.findUnique({
        where: { name: name.trim() },
      });
      if (duplicate) {
        return NextResponse.json({ error: 'Company with this name already exists' }, { status: 409 });
      }
    }

    const company = await db.company.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(status !== undefined && { status }),
        ...(distributorPhone !== undefined && { distributorPhone: distributorPhone?.trim() || null }),
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'edit',
        entityType: 'company',
        entityId: id,
        oldValue: JSON.stringify(existing),
        newValue: JSON.stringify(company),
        description: `Company "${company.name}" updated`,
      },
    });

    return NextResponse.json({ company });
  } catch (error: any) {
    console.error('Failed to update company:', error);
    return NextResponse.json({ error: error.message || 'Failed to update company' }, { status: 500 });
  }
}

// PATCH /api/companies/[id] - Partial update (e.g., distributor phone)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, status, distributorPhone } = body;

    const existing = await db.company.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const company = await db.company.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(status !== undefined && { status }),
        ...(distributorPhone !== undefined && { distributorPhone: distributorPhone?.trim() || null }),
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'edit',
        entityType: 'company',
        entityId: id,
        oldValue: JSON.stringify({ distributorPhone: existing.distributorPhone }),
        newValue: JSON.stringify({ distributorPhone: company.distributorPhone }),
        description: `Company "${company.name}" distributor phone updated`,
      },
    });

    return NextResponse.json({ company });
  } catch (error: any) {
    console.error('Failed to update company:', error);
    return NextResponse.json({ error: error.message || 'Failed to update company' }, { status: 500 });
  }
}

// DELETE /api/companies/[id] - Delete company
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            orderbookers: true,
            companyBalances: true,
            transactions: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Prevent delete if company has orderbookers or transactions
    if (existing._count.orderbookers > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${existing._count.orderbookers} orderbooker(s) are assigned to this company. Reassign them first.` },
        { status: 400 }
      );
    }

    if (existing._count.transactions > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${existing._count.transactions} transaction(s) exist for this company. Deactivate instead.` },
        { status: 400 }
      );
    }

    // Safe to delete (ShopCompanyBalances will cascade)
    await db.company.delete({ where: { id } });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'delete',
        entityType: 'company',
        entityId: id,
        oldValue: JSON.stringify(existing),
        description: `Company "${existing.name}" deleted`,
      },
    });

    return NextResponse.json({ success: true, message: 'Company deleted' });
  } catch (error: any) {
    console.error('Failed to delete company:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete company' }, { status: 500 });
  }
}
