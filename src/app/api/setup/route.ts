import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// POST /api/setup — Create all users if database is empty
export async function POST() {
  try {
    const userCount = await db.user.count();

    if (userCount > 0) {
      return NextResponse.json({ message: 'Database already has users', userCount });
    }

    // Create all users with original passwords
    const adminPass = await bcrypt.hash('@AFE@123654', 10);
    const obPass = await bcrypt.hash('ob123', 10);

    const admin = await db.user.create({
      data: {
        username: 'al-falah trader',
        password: adminPass,
        name: 'AL-FALAH TRADER',
        role: 'admin',
        phone: '',
        status: 'active',
      },
    });

    const ahmed = await db.user.create({
      data: {
        username: 'ahmed',
        password: obPass,
        name: 'Ahmed Khan',
        role: 'orderbooker',
        phone: '',
        status: 'active',
      },
    });

    const bilal = await db.user.create({
      data: {
        username: 'bilal',
        password: obPass,
        name: 'Bilal Ali',
        role: 'orderbooker',
        phone: '',
        status: 'active',
      },
    });

    const ob01 = await db.user.create({
      data: {
        username: 'ob01',
        password: obPass,
        name: 'Danish Ramzan',
        role: 'orderbooker',
        phone: '',
        status: 'active',
      },
    });

    const ob02 = await db.user.create({
      data: {
        username: 'ob02',
        password: obPass,
        name: 'Kashif Khan',
        role: 'orderbooker',
        phone: '',
        status: 'active',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'All 5 users created',
      users: [
        { username: admin.username, role: admin.role },
        { username: ahmed.username, role: ahmed.role },
        { username: bilal.username, role: bilal.role },
        { username: ob01.username, role: ob01.role },
        { username: ob02.username, role: ob02.role },
      ],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Setup error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/setup — Check if setup is needed
export async function GET() {
  try {
    const userCount = await db.user.count();
    return NextResponse.json({ needsSetup: userCount === 0, userCount });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg, needsSetup: true }, { status: 500 });
  }
}
