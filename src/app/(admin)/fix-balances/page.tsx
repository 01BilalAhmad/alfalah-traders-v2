'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiFetch } from '@/lib/api';

export default function FixBalancesPage() {
  const { user } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('CBL LU Biscuits');

  if (!user || user.role !== 'admin') {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>Admin login required</h2>
        <p>Please login as admin first, then revisit this page.</p>
        <a href="/" style={{ color: '#2563EB', textDecoration: 'underline' }}>Go to Login</a>
      </div>
    );
  }

  const runFix = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await apiFetch('/api/tally/fix-resolved-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: companyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Fix failed');
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20, fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#2563EB', marginBottom: 8 }}>🔧 Fix Resolved Balances</h1>
      <p style={{ color: '#64748B', marginBottom: 24, fontSize: 14 }}>
        This tool fixes already-resolved tally adjustments that were created without a company.
        It assigns them to the specified company and recalculates balances.
      </p>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
          Company name to assign:
        </label>
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          style={{
            width: '100%', padding: '12px 16px', fontSize: 16,
            borderRadius: 8, border: '1px solid #CBD5E1',
            boxSizing: 'border-box',
          }}
          placeholder="e.g., CBL LU Biscuits"
        />
        <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
          This company will be assigned to all adjustment transactions that have no company.
        </p>
      </div>

      <button
        onClick={runFix}
        disabled={loading || !companyName.trim()}
        style={{
          padding: '14px 32px', fontSize: 16, fontWeight: 700,
          backgroundColor: loading ? '#94A3B8' : '#2563EB',
          color: 'white', border: 'none', borderRadius: 8,
          cursor: loading ? 'not-allowed' : 'pointer',
          width: '100%',
        }}
      >
        {loading ? '⏳ Fixing balances... Please wait...' : '🚀 Run Fix Now'}
      </button>

      {error && (
        <div style={{
          marginTop: 20, padding: 16, backgroundColor: '#FEE2E2',
          border: '1px solid #DC2626', borderRadius: 8, color: '#DC2626',
        }}>
          <strong>❌ Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 20 }}>
          <div style={{
            padding: 16, backgroundColor: '#D1FAE5',
            border: '1px solid #059669', borderRadius: 8, marginBottom: 16,
          }}>
            <strong style={{ color: '#059669', fontSize: 18 }}>✅ Fix Complete!</strong>
            <div style={{ marginTop: 8, fontSize: 14, color: '#064E3B' }}>
              <div>Company assigned: <strong>{result.targetCompany}</strong></div>
              <div>Total adjustment transactions: <strong>{result.totalAdjustmentTxns}</strong></div>
              <div>Transactions fixed: <strong style={{ color: '#059669' }}>{result.fixedTxns}</strong></div>
              <div>Shops fixed: <strong style={{ color: '#059669' }}>{result.fixedShops}</strong></div>
              {result.skipped > 0 && <div>Skipped (no company): {result.skipped}</div>}
              {result.failed > 0 && <div style={{ color: '#DC2626' }}>Failed: {result.failed}</div>}
            </div>
          </div>

          {result.results && result.results.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 12, fontSize: 16 }}>Detailed Results:</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%', borderCollapse: 'collapse',
                  fontSize: 13, border: '1px solid #E5E7EB',
                }}>
                  <thead>
                    <tr style={{ backgroundColor: '#2563EB', color: 'white' }}>
                      <th style={{ padding: 8, textAlign: 'left' }}>Shop</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Txns</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Company</th>
                      <th style={{ padding: 8, textAlign: 'right' }}>New Shop Balance</th>
                      <th style={{ padding: 8, textAlign: 'right' }}>New Company Balance</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r: any, i: number) => (
                      <tr key={i} style={{
                        backgroundColor: i % 2 === 0 ? '#F9FAFB' : 'white',
                        borderBottom: '1px solid #E5E7EB',
                      }}>
                        <td style={{ padding: 8 }}>{r.shopName || '—'}</td>
                        <td style={{ padding: 8, textAlign: 'center' }}>{r.txnCount || '—'}</td>
                        <td style={{ padding: 8 }}>{r.companyAssigned || '—'}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>
                          {r.newShopBalance !== undefined ? `Rs ${r.newShopBalance.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ padding: 8, textAlign: 'right' }}>
                          {r.newCompanyBalance !== undefined ? `Rs ${r.newCompanyBalance.toLocaleString()}` : '—'}
                        </td>
                        <td style={{
                          padding: 8, textAlign: 'center',
                          color: r.status === 'fixed' ? '#059669' : r.status === 'skipped' ? '#D97706' : '#DC2626',
                          fontWeight: 700,
                        }}>
                          {r.status === 'fixed' ? '✅ Fixed' : r.status === 'skipped' ? '⏭️ Skipped' : '❌ Failed'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{
            marginTop: 20, padding: 16, backgroundColor: '#EFF6FF',
            borderRadius: 8, fontSize: 14, color: '#1E3A8A',
          }}>
            <strong>📋 Next steps:</strong>
            <ul style={{ marginTop: 8, paddingLeft: 20 }}>
              <li>Check <strong>Balance Sheet</strong> — balances should now be correct</li>
              <li>OB app users should do <strong>pull-to-refresh</strong> to see updated balances</li>
              <li>Check <strong>Company Report</strong> — CBL LU Biscuits balance should be correct</li>
              <li>This page can be deleted after verification — it's a one-time tool</li>
            </ul>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ marginTop: 20, textAlign: 'center', color: '#64748B', fontSize: 14 }}>
          <p>⏳ Processing... This may take 30-60 seconds depending on number of shops.</p>
          <p>Please don't close this page.</p>
        </div>
      )}
    </div>
  );
}
