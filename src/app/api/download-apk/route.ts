import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';

// APK download endpoint — uses streaming to avoid memory DoS
export async function GET(request: NextRequest) {
  try {
    const apkPath = join(process.cwd(), 'public', 'Al-Falah-Orderbooker.apk');

    // Check if file exists and get stats (async — avoids blocking event loop)
    let stats;
    try {
      stats = await stat(apkPath);
    } catch {
      return NextResponse.json({ error: 'APK not found' }, { status: 404 });
    }

    // SECURITY: Stream file instead of buffering entire APK into memory (was using readFileSync)
    const fileStream = createReadStream(apkPath);
    const readable = Readable.toWeb(fileStream) as ReadableStream;

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="Al-Falah-Orderbooker.apk"',
        'Content-Length': stats.size.toString(),
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
