import { NextRequest, NextResponse } from 'next/server';
import { getPgClient } from '@/lib/pg';
import { getSmsConfig, setSmsConfig, SmsConfig } from '@/lib/sms';

// GET /api/sms-settings — Get current SMS configuration
export async function GET() {
  let client;
  try {
    client = getPgClient();
    await client.connect();
    const config = await getSmsConfig(client);
    await client.end();
    return NextResponse.json(config);
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error fetching SMS settings:', error);
    return NextResponse.json({ error: 'Failed to fetch SMS settings' }, { status: 500 });
  }
}

// POST /api/sms-settings — Update SMS configuration
export async function POST(request: NextRequest) {
  let client;
  try {
    const config: SmsConfig = await request.json();

    // Validate gateway URL format if provided
    if (config.gatewayUrl) {
      try {
        new URL(config.gatewayUrl);
      } catch {
        return NextResponse.json({ error: 'Invalid gateway URL format' }, { status: 400 });
      }
    }

    client = getPgClient();
    await client.connect();
    await setSmsConfig(client, config);
    await client.end();

    return NextResponse.json({ success: true, message: 'SMS settings saved successfully' });
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error('Error saving SMS settings:', error);
    return NextResponse.json({ error: 'Failed to save SMS settings' }, { status: 500 });
  }
}
