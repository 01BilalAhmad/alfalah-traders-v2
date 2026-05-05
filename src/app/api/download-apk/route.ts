import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';

export async function GET(request: NextRequest) {
  try {
    const apkPath = join(process.cwd(), 'public', 'Al-Falah-Orderbooker.apk');
    const fileBuffer = readFileSync(apkPath);
    const stat = statSync(apkPath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="Al-Falah-Orderbooker.apk"',
        'Content-Length': stat.size.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('APK download error:', error);
    return NextResponse.json({ error: 'APK not found' }, { status: 404 });
  }
}
