import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getWhatsAppSettings, updateWhatsAppSettings } from '@/lib/whatsapp';

// GET /api/whatsapp/settings — get all WhatsApp settings
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const settings = await getWhatsAppSettings();
  // Mask API key for security (show only last 4 chars)
  if (settings.whatsapp_api_key && settings.whatsapp_api_key.length > 8) {
    settings.whatsapp_api_key_masked = '••••' + settings.whatsapp_api_key.slice(-4);
    delete settings.whatsapp_api_key;
  }
  return NextResponse.json({ settings });
}

// PATCH /api/whatsapp/settings — update settings
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await request.json();
  await updateWhatsAppSettings(body);
  return NextResponse.json({ success: true });
}
