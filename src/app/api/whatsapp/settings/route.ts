import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getWhatsAppSettings, updateWhatsAppSettings, sendTextMessage } from '@/lib/whatsapp';

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

// POST /api/whatsapp/settings — send test SMS (merged from /test route)
// Body: { phone: "03001234567", action: "test" }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { phone } = await request.json();
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });

  const result = await sendTextMessage(
    phone,
    '🧪 Test Message\n\nWhatsApp API is working!\n— AL-FALAH TRADERS'
  );

  if (result.success) {
    return NextResponse.json({ success: true, message: 'Test SMS sent!' });
  }
  return NextResponse.json({ success: false, error: result.error }, { status: 400 });
}
