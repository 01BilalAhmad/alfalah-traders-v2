/**
 * Server-side Auth Guard Utility
 * Verifies that the authenticated user is an admin
 * Used by sensitive API routes (backup, restore, reset-password, etc.)
 */

import { db } from '@/lib/db';

interface AuthResult {
  authorized: boolean;
  userId: string | null;
  user: { id: string; username: string; name: string; role: string } | null;
  error?: string;
}

/**
 * Verify that the request comes from an authenticated admin user.
 * Reads the x-auth-userid header set by middleware (from token parsing)
 * and verifies the user exists and is an admin in the database.
 */
export async function requireAdmin(request: Request): Promise<AuthResult> {
  const userId = request.headers.get('x-auth-userid');

  if (!userId) {
    return { authorized: false, userId: null, user: null, error: 'Authentication required' };
  }

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, name: true, role: true, status: true },
    });

    if (!user) {
      return { authorized: false, userId, user: null, error: 'User not found' };
    }

    if (user.status === 'inactive') {
      return { authorized: false, userId, user: null, error: 'Account is deactivated' };
    }

    if (user.role !== 'admin') {
      return { authorized: false, userId, user: null, error: 'Admin access required' };
    }

    return { authorized: true, userId, user };
  } catch (error) {
    console.error('Auth guard error:', error);
    return { authorized: false, userId, user: null, error: 'Authentication verification failed' };
  }
}

/**
 * Verify that the request comes from any authenticated user (admin or orderbooker).
 * Reads the x-auth-userid header set by middleware.
 */
export async function requireAuth(request: Request): Promise<AuthResult> {
  const userId = request.headers.get('x-auth-userid');

  if (!userId) {
    return { authorized: false, userId: null, user: null, error: 'Authentication required' };
  }

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, name: true, role: true, status: true },
    });

    if (!user) {
      return { authorized: false, userId, user: null, error: 'User not found' };
    }

    if (user.status === 'inactive') {
      return { authorized: false, userId, user: null, error: 'Account is deactivated' };
    }

    return { authorized: true, userId, user };
  } catch (error) {
    console.error('Auth guard error:', error);
    return { authorized: false, userId, user: null, error: 'Authentication verification failed' };
  }
}
