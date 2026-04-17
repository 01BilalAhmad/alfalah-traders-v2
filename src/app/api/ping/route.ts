import { NextResponse } from 'next/server';

// GET /api/ping — Server health check for mobile app
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'Al-Falah Traders API is running',
    time: new Date().toISOString()
  });
}
