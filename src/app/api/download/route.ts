import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';

// Flutter APK download endpoint — uses streaming to avoid memory DoS
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const version = searchParams.get('v') || 'flutter';

    let apkPath: string;
    let filename: string;

    if (version === 'flutter') {
      apkPath = join(process.cwd(), 'public', 'Al-Falah-Orderbooker.apk');
      filename = 'Al-Falah-Orderbooker-v1.0.0.apk';
    } else {
      apkPath = join(process.cwd(), 'public', 'Al-Falah-Traders.apk');
      filename = 'Al-Falah-Traders.apk';
    }

    // Check if file exists and get stats (async — avoids blocking event loop)
    let stats;
    try {
      stats = await stat(apkPath);
    } catch {
      return NextResponse.json({ error: 'APK file not found' }, { status: 404 });
    }

    // SECURITY: Stream file instead of buffering entire APK into memory
    const fileStream = createReadStream(apkPath);
    const readable = Readable.toWeb(fileStream) as ReadableStream;

    return new NextResponse(readable, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': stats.size.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('APK download error:', error);
    return NextResponse.json({ error: 'Failed to download APK' }, { status: 500 });
  }
}
