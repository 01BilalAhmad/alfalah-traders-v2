/**
 * WhatsApp Receipt Image Generator
 *
 * Generates receipt images as PNG using @vercel/og (ImageResponse).
 * These images are sent along with WhatsApp messages.
 *
 * Receipt types:
 * 1. Recovery Receipt — sent when admin approves recovery
 * 2. Credit Receipt — sent when admin posts credit
 * 3. Overdue Reminder — sent as overdue reminder
 */

import { ImageResponse } from '@vercel/og';
import { getPool } from '@/lib/pg';

// ─── Get business config ────────────────────────────────────────
async function getBusinessConfig(): Promise<{ name: string; phone: string }> {
  try {
    const pool = getPool();
    const nameRes = await pool.query(`SELECT value FROM "SystemConfig" WHERE key = 'businessName' LIMIT 1`);
    const phoneRes = await pool.query(`SELECT value FROM "SystemConfig" WHERE key = 'businessPhone' LIMIT 1`);
    return {
      name: nameRes.rows[0]?.value || 'AL-FALAH TRADERS',
      phone: phoneRes.rows[0]?.value || '',
    };
  } catch {
    return { name: 'AL-FALAH TRADERS', phone: '' };
  }
}

// ─── Common styles ──────────────────────────────────────────────
const STYLES = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
    fontFamily: 'sans-serif',
    padding: '40px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '15px',
    borderBottom: '3px solid #2563EB',
  },
  businessName: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#2563EB',
    margin: 0,
  },
  receiptTitle: {
    fontSize: '18px',
    color: '#64748B',
    margin: '5px 0 0 0',
  },
  body: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    flex: 1,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #E5E7EB',
  },
  label: {
    fontSize: '16px',
    color: '#64748B',
  },
  value: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#0F172A',
  },
  amountValue: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#0F172A',
  },
  footer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    marginTop: '20px',
    paddingTop: '15px',
    borderTop: '2px solid #E5E7EB',
  },
  thankYou: {
    fontSize: '14px',
    color: '#64748B',
    marginTop: '5px',
  },
};

// ─── Generate Recovery Receipt ──────────────────────────────────
export async function generateRecoveryReceipt(opts: {
  shopName: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  orderbookerName?: string;
  date: string;
}): Promise<Buffer> {
  const config = await getBusinessConfig();

  return new ImageResponse(
    (
      <div style={STYLES.container}>
        <div style={STYLES.header}>
          <p style={STYLES.businessName}>{config.name}</p>
          <p style={STYLES.receiptTitle}>✅ Recovery Receipt</p>
        </div>
        <div style={STYLES.body}>
          <div style={STYLES.row}>
            <span style={STYLES.label}>🏪 Shop</span>
            <span style={STYLES.value}>{opts.shopName}</span>
          </div>
          <div style={STYLES.row}>
            <span style={STYLES.label}>📅 Date</span>
            <span style={STYLES.value}>{opts.date}</span>
          </div>
          <div style={STYLES.row}>
            <span style={STYLES.label}>💰 Recovery Amount</span>
            <span style={{ ...STYLES.amountValue, color: '#059669' }}>
              Rs {opts.amount.toLocaleString('en-PK')}
            </span>
          </div>
          <div style={STYLES.row}>
            <span style={STYLES.label}>📋 Previous Balance</span>
            <span style={STYLES.value}>Rs {opts.previousBalance.toLocaleString('en-PK')}</span>
          </div>
          <div style={STYLES.row}>
            <span style={STYLES.label}>✅ New Balance</span>
            <span style={{ ...STYLES.amountValue, color: '#0F172A' }}>
              Rs {opts.newBalance.toLocaleString('en-PK')}
            </span>
          </div>
          {opts.orderbookerName && (
            <div style={STYLES.row}>
              <span style={STYLES.label}>👤 Orderbooker</span>
              <span style={STYLES.value}>{opts.orderbookerName}</span>
            </div>
          )}
        </div>
        <div style={STYLES.footer}>
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#059669' }}>Thank You! 🙏</p>
          <p style={STYLES.thankYou}>{config.name} • {config.phone}</p>
        </div>
      </div>
    ),
    { width: 600, height: 700 }
  ) as unknown as Buffer; // ImageResponse returns Buffer-like Response
}

// ─── Generate Credit Receipt ────────────────────────────────────
export async function generateCreditReceipt(opts: {
  shopName: string;
  amount: number;
  newBalance: number;
  companyName?: string;
  date: string;
}): Promise<Buffer> {
  const config = await getBusinessConfig();

  return new ImageResponse(
    (
      <div style={STYLES.container}>
        <div style={STYLES.header}>
          <p style={STYLES.businessName}>{config.name}</p>
          <p style={STYLES.receiptTitle}>📦 Credit Receipt</p>
        </div>
        <div style={STYLES.body}>
          <div style={STYLES.row}>
            <span style={STYLES.label}>🏪 Shop</span>
            <span style={STYLES.value}>{opts.shopName}</span>
          </div>
          <div style={STYLES.row}>
            <span style={STYLES.label}>📅 Date</span>
            <span style={STYLES.value}>{opts.date}</span>
          </div>
          <div style={STYLES.row}>
            <span style={STYLES.label}>📦 Credit Amount</span>
            <span style={{ ...STYLES.amountValue, color: '#2563EB' }}>
              Rs {opts.amount.toLocaleString('en-PK')}
            </span>
          </div>
          <div style={STYLES.row}>
            <span style={STYLES.label}>✅ New Balance</span>
            <span style={{ ...STYLES.amountValue, color: '#0F172A' }}>
              Rs {opts.newBalance.toLocaleString('en-PK')}
            </span>
          </div>
          {opts.companyName && (
            <div style={STYLES.row}>
              <span style={STYLES.label}>🏢 Company</span>
              <span style={STYLES.value}>{opts.companyName}</span>
            </div>
          )}
        </div>
        <div style={STYLES.footer}>
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#2563EB' }}>Thank You! 🙏</p>
          <p style={STYLES.thankYou}>{config.name} • {config.phone}</p>
        </div>
      </div>
    ),
    { width: 600, height: 700 }
  ) as unknown as Buffer;
}

// ─── Generate Overdue Reminder Image ────────────────────────────
//
// v2 — FIFO-based, 3-tier transparency (Aug 2026)
// ====================================================================
// Shows three clearly labeled numbers on the receipt image so shopkeeper
// can match them with what the orderbooker tells them:
//   1. Total Balance    (red, large)   — full outstanding
//   2. Overdue Amount   (red, large)   — portion 14+ days old (FIFO)
//   3. Overdue Days     (red, large)   — since OLDEST unpaid credit
// Plus optional top 3 oldest unpaid bills listed as a detail table.
//
// Backward compat: if overdueAmount is not provided (legacy callers),
// only "Outstanding Balance" is shown (old behavior).
export async function generateOverdueImage(opts: {
  shopName: string;
  balance?: number;              // legacy — kept for backward compat callers
  totalBalance?: number;         // v2 — preferred (full outstanding)
  overdueAmount?: number;        // v2 — portion 14+ days old (FIFO)
  daysOverdue: number;
  detailBills?: Array<{
    date: string;
    amount: number;
    daysOld: number;
  }>;
}): Promise<Buffer> {
  const config = await getBusinessConfig();

  // Resolve which "balance" to display
  const totalDisplay = opts.totalBalance ?? opts.balance ?? 0;
  const hasV2Fields = opts.overdueAmount !== undefined && opts.totalBalance !== undefined;

  // Compute dynamic height — base 600, +90px per detail bill (up to 3)
  const detailBills = (opts.detailBills || []).slice(0, 3);
  const height = 600 + detailBills.length * 90;

  return new ImageResponse(
    (
      <div style={{
        ...STYLES.container,
        backgroundColor: '#FEF2F2',
      }}>
        <div style={{
          ...STYLES.header,
          borderBottom: '3px solid #DC2626',
        }}>
          <p style={{
            ...STYLES.businessName,
            color: '#DC2626',
          }}>{config.name}</p>
          <p style={{
            ...STYLES.receiptTitle,
            color: '#DC2626',
            fontSize: '20px',
            fontWeight: 700,
          }}>⚠️ Payment Reminder</p>
        </div>
        <div style={STYLES.body}>
          <div style={STYLES.row}>
            <span style={STYLES.label}>🏪 Shop</span>
            <span style={STYLES.value}>{opts.shopName}</span>
          </div>

          {hasV2Fields ? (
            <>
              {/* v2 — three labeled numbers for full transparency */}
              <div style={STYLES.row}>
                <span style={STYLES.label}>📊 Total Balance</span>
                <span style={{ ...STYLES.amountValue, color: '#0F172A' }}>
                  Rs {totalDisplay.toLocaleString('en-PK')}
                </span>
              </div>
              <div style={STYLES.row}>
                <span style={{ ...STYLES.label, color: '#DC2626', fontWeight: 700 }}>
                  🔥 Overdue Amount
                </span>
                <span style={{ ...STYLES.amountValue, color: '#DC2626' }}>
                  Rs {(opts.overdueAmount ?? 0).toLocaleString('en-PK')}
                </span>
              </div>
              <div style={STYLES.row}>
                <span style={{ ...STYLES.label, color: '#DC2626', fontWeight: 700 }}>
                  📅 Overdue Days
                </span>
                <span style={{ ...STYLES.amountValue, color: '#DC2626' }}>
                  {opts.daysOverdue} Days
                </span>
              </div>
            </>
          ) : (
            <>
              {/* legacy — single number */}
              <div style={STYLES.row}>
                <span style={STYLES.label}>💰 Outstanding Balance</span>
                <span style={{ ...STYLES.amountValue, color: '#DC2626' }}>
                  Rs {totalDisplay.toLocaleString('en-PK')}
                </span>
              </div>
              <div style={STYLES.row}>
                <span style={STYLES.label}>📅 Overdue</span>
                <span style={{ ...STYLES.amountValue, color: '#DC2626' }}>
                  {opts.daysOverdue} Days
                </span>
              </div>
            </>
          )}

          {/* Detail section — top 3 oldest unpaid bills (FIFO) */}
          {detailBills.length > 0 && (
            <div style={{
              marginTop: '8px',
              padding: '10px 0',
              borderTop: '1px solid #FECACA',
            }}>
              <p style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#7F1D1D',
                margin: '0 0 8px 0',
              }}>
                ⚠️ Purane bills (urgent):
              </p>
              {detailBills.map((bill, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '4px 0',
                  fontSize: '13px',
                  color: '#422006',
                }}>
                  <span>• {bill.date} ({bill.daysOld}d)</span>
                  <span style={{ fontWeight: 600 }}>
                    Rs {bill.amount.toLocaleString('en-PK')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={STYLES.footer}>
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#DC2626' }}>
            Please Make Payment ASAP
          </p>
          <p style={STYLES.thankYou}>{config.name} • {config.phone}</p>
        </div>
      </div>
    ),
    { width: 600, height }
  ) as unknown as Buffer;
}
