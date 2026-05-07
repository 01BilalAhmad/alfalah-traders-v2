/**
 * SMS Gateway Utility for Al-Falah Traders
 *
 * Uses an Android phone running an SMS Gateway app as the SMS sender.
 * The app exposes an HTTP endpoint that this module calls to send SMS.
 *
 * Supported SMS Gateway Apps:
 * - SMS Gateway by SMS Gateway Team (default)
 * - HTTP SMS
 * - Any app that exposes an HTTP API for sending SMS
 */

// SMS Gateway Configuration (loaded from AppSetting table via API)
export interface SmsConfig {
  enabled: boolean;
  gatewayUrl: string;       // e.g. "http://192.168.1.100:8080"
  senderPhone: string;      // Phone number of the SIM (for reference)
  creditSmsEnabled: boolean;
  recoverySmsEnabled: boolean;
  customMessage: string;    // Custom SMS template (optional)
}

// Default SMS templates
export function getCreditSmsTemplate(shopName: string, amount: number, outstanding: number, companyName?: string): string {
  const company = companyName ? ` (${companyName})` : '';
  return `AL FALAH TRADERS${company}: Rs. ${amount.toLocaleString('en-PK')} credit posted to ${shopName}. Outstanding: Rs. ${outstanding.toLocaleString('en-PK')}`;
}

export function getRecoverySmsTemplate(shopName: string, amount: number, outstanding: number, companyName?: string): string {
  const company = companyName ? ` (${companyName})` : '';
  return `AL FALAH TRADERS${company}: Rs. ${amount.toLocaleString('en-PK')} recovery received from ${shopName}. Outstanding: Rs. ${outstanding.toLocaleString('en-PK')}`;
}

/**
 * Send SMS via Android SMS Gateway app
 *
 * Supported SMS Gateway App API formats:
 * - Simple SMS Gateway: POST http://ip:port/send-sms with { phone, message }
 * - SMS Gateway by mebjas: GET http://ip:port/send?phone=xxx&message=xxx
 * - HTTP SMS: POST http://ip:port/sms with { phone, message }
 *
 * We try POST to /send-sms first (Simple SMS Gateway format),
 * then GET to /send (mebjas format), then POST to /sms as final fallback
 */
export async function sendSms(phone: string, message: string, gatewayUrl: string): Promise<{ success: boolean; error?: string }> {
  if (!phone || !gatewayUrl) {
    return { success: false, error: 'Phone number and gateway URL are required' };
  }

  // Clean phone number - remove spaces, dashes, etc.
  const cleanPhone = phone.replace(/[\s\-()]/g, '');

  // Ensure phone starts with country code for Pakistan
  let formattedPhone = cleanPhone;
  if (cleanPhone.startsWith('0')) {
    formattedPhone = '92' + cleanPhone.substring(1);
  } else if (!cleanPhone.startsWith('92') && !cleanPhone.startsWith('+92')) {
    formattedPhone = '92' + cleanPhone;
  }

  const baseUrl = gatewayUrl.replace(/\/+$/, '');

  // List of endpoints to try (in order of priority)
  const endpoints: { method: string; url: string; body?: string }[] = [
    // 1. Simple SMS Gateway format (POST /send-sms)
    {
      method: 'POST',
      url: `${baseUrl}/send-sms`,
      body: JSON.stringify({ phone: formattedPhone, message }),
    },
    // 2. SMS Gateway by mebjas format (GET /send)
    {
      method: 'GET',
      url: `${baseUrl}/send?phone=${encodeURIComponent(formattedPhone)}&message=${encodeURIComponent(message)}`,
    },
    // 3. Generic format (POST /sms)
    {
      method: 'POST',
      url: `${baseUrl}/sms`,
      body: JSON.stringify({ phone: formattedPhone, message }),
    },
    // 4. Another common format (GET /sms)
    {
      method: 'GET',
      url: `${baseUrl}/sms?phone=${encodeURIComponent(formattedPhone)}&message=${encodeURIComponent(message)}`,
    },
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const fetchOptions: RequestInit = {
        method: endpoint.method,
        signal: controller.signal,
      };

      if (endpoint.body) {
        fetchOptions.headers = { 'Content-Type': 'application/json' };
        fetchOptions.body = endpoint.body;
      }

      const response = await fetch(endpoint.url, fetchOptions);
      clearTimeout(timeout);

      if (response.ok) {
        return { success: true };
      }

      // If 404, try next endpoint
      if (response.status === 404) continue;

      // For other errors, also try next endpoint
      continue;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { success: false, error: 'Gateway request timed out (10s)' };
      }
      // Connection error - try next endpoint
      continue;
    }
  }

  return { success: false, error: 'All SMS gateway endpoints failed. Check if the app is running and the URL is correct.' };
}

/**
 * Get SMS config from database
 */
export async function getSmsConfig(client: any): Promise<SmsConfig> {
  const defaultConfig: SmsConfig = {
    enabled: false,
    gatewayUrl: '',
    senderPhone: '',
    creditSmsEnabled: true,
    recoverySmsEnabled: false,
    customMessage: '',
  };

  try {
    // Ensure AppSetting table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "AppSetting" (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL DEFAULT '',
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    const res = await client.query(
      `SELECT key, value FROM "AppSetting" WHERE key LIKE 'sms_%'`
    );

    for (const row of res.rows) {
      switch (row.key) {
        case 'sms_enabled':
          defaultConfig.enabled = row.value === 'true';
          break;
        case 'sms_gateway_url':
          defaultConfig.gatewayUrl = row.value;
          break;
        case 'sms_sender_phone':
          defaultConfig.senderPhone = row.value;
          break;
        case 'sms_credit_enabled':
          defaultConfig.creditSmsEnabled = row.value === 'true';
          break;
        case 'sms_recovery_enabled':
          defaultConfig.recoverySmsEnabled = row.value === 'true';
          break;
        case 'sms_custom_message':
          defaultConfig.customMessage = row.value;
          break;
      }
    }
  } catch (error) {
    console.warn('Failed to load SMS config:', error);
  }

  return defaultConfig;
}

/**
 * Set SMS config in database
 */
export async function setSmsConfig(client: any, config: SmsConfig): Promise<void> {
  const settings: Record<string, string> = {
    'sms_enabled': config.enabled ? 'true' : 'false',
    'sms_gateway_url': config.gatewayUrl,
    'sms_sender_phone': config.senderPhone,
    'sms_credit_enabled': config.creditSmsEnabled ? 'true' : 'false',
    'sms_recovery_enabled': config.recoverySmsEnabled ? 'true' : 'false',
    'sms_custom_message': config.customMessage || '',
  };

  // Ensure AppSetting table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS "AppSetting" (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  for (const [key, value] of Object.entries(settings)) {
    await client.query(
      `INSERT INTO "AppSetting" (id, key, value, "updatedAt")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $3, "updatedAt" = NOW()`,
      [`setting_${key}_${Date.now()}`, key, value]
    );
  }
}
