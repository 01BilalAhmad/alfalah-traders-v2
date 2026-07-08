import { NextResponse } from 'next/server';

// GET /api/ping
// Health check endpoint for mobile app
export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
