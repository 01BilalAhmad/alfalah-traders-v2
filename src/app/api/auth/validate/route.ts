import { NextResponse } from 'next/server';

// Simple health check endpoint for APK auto-detect
// The APK's testURLQuick() calls this to verify the server is running
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'Al-Falah Traders',
    timestamp: new Date().toISOString(),
  });
}
