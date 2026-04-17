import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const apkPath = path.join(process.cwd(), 'public', 'Al-Falah-Traders.apk');
    
    // Check if file exists
    try {
      await fs.access(apkPath);
    } catch {
      return NextResponse.json({ error: 'APK file not found' }, { status: 404 });
    }

    const fileBuffer = await fs.readFile(apkPath);
    const stats = await fs.stat(apkPath);
    
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="Al-Falah-Recovery.apk"',
        'Content-Length': stats.size.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('APK download error:', error);
    return NextResponse.json({ error: 'Failed to download APK' }, { status: 500 });
  }
}
