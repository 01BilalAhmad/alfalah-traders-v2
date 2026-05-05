import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';

// GET /api/users/:id/preferences - Get user preferences
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let client;
  try {
    const { id: userId } = await params;

    client = getPgClient();
    await client.connect();

    const prefRes = await client.query(
      'SELECT * FROM "UserPreference" WHERE "userId" = $1',
      [userId]
    );

    await client.end();

    if (prefRes.rows.length === 0) {
      return NextResponse.json({
        userId,
        tourCompleted: false,
        preferences: null,
      });
    }

    const pref = prefRes.rows[0];
    return NextResponse.json({
      userId: pref.userId,
      tourCompleted: pref.tourCompleted,
      preferences: pref.preferences ? JSON.parse(pref.preferences) : null,
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error fetching user preferences:', error);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}

// PATCH /api/users/:id/preferences - Update user preferences
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let client;
  try {
    const { id: userId } = await params;
    const body = await request.json();
    const { tourCompleted, preferences } = body;

    client = getPgClient();
    await client.connect();

    // Upsert preferences
    const existingRes = await client.query(
      'SELECT id FROM "UserPreference" WHERE "userId" = $1',
      [userId]
    );

    if (existingRes.rows.length > 0) {
      // Update
      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (tourCompleted !== undefined) {
        setClauses.push(`"tourCompleted" = $${paramIndex++}`);
        params.push(tourCompleted);
      }
      if (preferences !== undefined) {
        setClauses.push(`preferences = $${paramIndex++}`);
        params.push(JSON.stringify(preferences));
      }

      if (setClauses.length > 0) {
        setClauses.push(`"updatedAt" = NOW()`);
        params.push(userId);
        await client.query(
          `UPDATE "UserPreference" SET ${setClauses.join(', ')} WHERE "userId" = $${paramIndex}`,
          params
        );
      }
    } else {
      // Insert
      const prefId = `pref_${Date.now().toString(36)}`;
      await client.query(
        `INSERT INTO "UserPreference" (id, "userId", "tourCompleted", preferences, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [prefId, userId, tourCompleted || false, preferences ? JSON.stringify(preferences) : null]
      );
    }

    // Return updated preferences
    const prefRes = await client.query(
      'SELECT * FROM "UserPreference" WHERE "userId" = $1',
      [userId]
    );

    await client.end();

    const pref = prefRes.rows[0];
    return NextResponse.json({
      userId: pref.userId,
      tourCompleted: pref.tourCompleted,
      preferences: pref.preferences ? JSON.parse(pref.preferences) : null,
    });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error updating user preferences:', error);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
