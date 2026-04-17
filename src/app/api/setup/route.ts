import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// POST /api/setup — Create admin user if not exists
export async function POST() {
  try {
    // Check if any user exists
    const userCount = await db.user.count();

    if (userCount > 0) {
      return NextResponse.json({ message: 'Database already has users', userCount });
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    const admin = await db.user.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        name: 'AL-FALAH TRADER',
        role: 'admin',
        phone: '',
        status: 'active',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Admin user created',
      username: 'admin',
      password: 'Admin@123',
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
