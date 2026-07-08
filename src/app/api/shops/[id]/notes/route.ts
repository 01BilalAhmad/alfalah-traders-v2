import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/pg';
import crypto from 'crypto';

// GET /api/shops/:id/notes - Get all notes for a shop
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shopId } = await params;

    const pool = getPool();

    // Verify shop exists
    const shopRes = await pool.query('SELECT id FROM "Shop" WHERE id = $1', [shopId]);
    if (shopRes.rows.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const notesRes = await pool.query(
      `SELECT n.*, u.name AS "creatorName"
       FROM "ShopNote" n
       LEFT JOIN "User" u ON n."createdBy" = u.id
       WHERE n."shopId" = $1
       ORDER BY n."updatedAt" DESC`,
      [shopId]
    );

    const notes = notesRes.rows.map((n: any) => ({
      id: n.id,
      shopId: n.shopId,
      note: n.note,
      createdBy: n.createdBy,
      creatorName: n.creatorName,
      createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
      updatedAt: n.updatedAt instanceof Date ? n.updatedAt.toISOString() : n.updatedAt,
    }));

    return NextResponse.json(notes);
  } catch (error) {
    console.error('Error fetching shop notes:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

// POST /api/shops/:id/notes - Create or update a note for a shop
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shopId } = await params;
    // SECURITY: Use authenticated user ID from proxy header
    const createdBy = request.headers.get('x-auth-userid');
    const { note } = await request.json();

    if (!note) {
      return NextResponse.json({ error: 'Note text is required' }, { status: 400 });
    }

    if (note.length > 1000) {
      return NextResponse.json({ error: 'Note must be 1000 characters or less' }, { status: 400 });
    }

    const pool = getPool();

    // Verify shop exists
    const shopRes = await pool.query('SELECT id FROM "Shop" WHERE id = $1', [shopId]);
    if (shopRes.rows.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Resolve createdBy: if not a valid user ID, find the admin user
    let resolvedCreatedBy = createdBy;
    if (!resolvedCreatedBy || resolvedCreatedBy === 'admin') {
      const adminRes = await pool.query(
        'SELECT id FROM "User" WHERE role = $1 LIMIT 1',
        ['admin']
      );
      if (adminRes.rows.length > 0) {
        resolvedCreatedBy = adminRes.rows[0].id;
      } else {
        // Fallback: use any first user
        const anyUserRes = await pool.query('SELECT id FROM "User" LIMIT 1');
        if (anyUserRes.rows.length > 0) {
          resolvedCreatedBy = anyUserRes.rows[0].id;
        } else {
          return NextResponse.json({ error: 'No users found in system' }, { status: 500 });
        }
      }
    }

    // Check if a note already exists for this shop by this user
    const existingRes = await pool.query(
      'SELECT id FROM "ShopNote" WHERE "shopId" = $1 AND "createdBy" = $2',
      [shopId, resolvedCreatedBy]
    );

    let result;
    if (existingRes.rows.length > 0) {
      // Update existing note
      const updateRes = await pool.query(
        `UPDATE "ShopNote" SET note = $1, "updatedAt" = NOW() WHERE "shopId" = $2 AND "createdBy" = $3
         RETURNING *`,
        [note, shopId, resolvedCreatedBy]
      );
      result = updateRes.rows[0];
    } else {
      // Create new note
      const noteId = `note_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
      const insertRes = await pool.query(
        `INSERT INTO "ShopNote" (id, "shopId", note, "createdBy", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING *`,
        [noteId, shopId, note, resolvedCreatedBy]
      );
      result = insertRes.rows[0];
    }

    return NextResponse.json({
      id: result.id,
      shopId: result.shopId,
      note: result.note,
      createdBy: result.createdBy,
      createdAt: result.createdAt instanceof Date ? result.createdAt.toISOString() : result.createdAt,
      updatedAt: result.updatedAt instanceof Date ? result.updatedAt.toISOString() : result.updatedAt,
    }, { status: existingRes.rows.length > 0 ? 200 : 201 });
  } catch (error) {
    console.error('Error saving shop note:', error);
    return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  }
}

// DELETE /api/shops/:id/notes - Delete a note for a shop
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shopId } = await params;
    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get('noteId');
    const createdBy = searchParams.get('createdBy');

    if (!noteId && !createdBy) {
      return NextResponse.json({ error: 'noteId or createdBy is required' }, { status: 400 });
    }

    const pool = getPool();

    let deleteRes;
    if (noteId) {
      deleteRes = await pool.query(
        'DELETE FROM "ShopNote" WHERE id = $1 AND "shopId" = $2 RETURNING id',
        [noteId, shopId]
      );
    } else {
      deleteRes = await pool.query(
        'DELETE FROM "ShopNote" WHERE "shopId" = $1 AND "createdBy" = $2 RETURNING id',
        [shopId, createdBy]
      );
    }

    if (deleteRes.rows.length === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting shop note:', error);
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
