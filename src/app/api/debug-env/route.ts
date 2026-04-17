import { NextResponse } from 'next/server';

// GET /api/debug-env — Check environment variables (no secrets shown)
export async function GET() {
  const dbUrl = process.env.DATABASE_URL || '';
  
  const masked = dbUrl 
    ? dbUrl.substring(0, 30) + '...(hidden)'
    : 'NOT SET!';
  
  const protocol = dbUrl.startsWith('postgresql://') ? 'VALID ✅' 
    : dbUrl.startsWith('postgres://') ? 'VALID ✅'
    : dbUrl ? 'INVALID ❌' : 'MISSING ❌';

  return NextResponse.json({
    DATABASE_URL_set: !!dbUrl,
    DATABASE_URL_protocol: protocol,
    DATABASE_URL_preview: masked,
    DATABASE_URL_length: dbUrl.length,
    NODE_ENV: process.env.NODE_ENV || 'not set',
    hint: dbUrl ? '' : 'DATABASE_URL is not set! Go to Vercel > Settings > Environment Variables > Add DATABASE_URL with your Neon connection string',
  });
}
