import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// POST /api/setup — Auto-seed database using Prisma (works with SQLite & PostgreSQL)
export async function POST() {
  try {
    // Check if users already exist
    const userCount = await db.user.count();

    if (userCount > 0) {
      return NextResponse.json({ success: true, message: 'Tables exist, users already seeded', userCount });
    }

    // Hash passwords
    const adminPass = await bcrypt.hash('@AFE@123654', 10);
    const obPass = await bcrypt.hash('ob123', 10);

    // Insert users
    await db.user.create({
      data: { id: 'admin-001', username: 'al-falah trader', password: adminPass, name: 'AL-FALAH TRADER', role: 'admin', phone: '', status: 'active' }
    });
    await db.user.create({
      data: { id: 'ob-ahmed', username: 'ahmed', password: obPass, name: 'Ahmed Khan', role: 'orderbooker', phone: '', status: 'active' }
    });
    await db.user.create({
      data: { id: 'ob-bilal', username: 'bilal', password: obPass, name: 'Bilal Ali', role: 'orderbooker', phone: '', status: 'active' }
    });
    await db.user.create({
      data: { id: 'ob-danish', username: 'ob01', password: obPass, name: 'Danish Ramzan', role: 'orderbooker', phone: '', status: 'active' }
    });
    await db.user.create({
      data: { id: 'ob-kashif', username: 'ob02', password: obPass, name: 'Kashif Khan', role: 'orderbooker', phone: '', status: 'active' }
    });

    return NextResponse.json({ success: true, message: 'All tables created + 5 users seeded!' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Setup error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const count = await db.user.count();
    return NextResponse.json({ needsSetup: count === 0, userCount: count });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg, needsSetup: true }, { status: 500 });
  }
}
