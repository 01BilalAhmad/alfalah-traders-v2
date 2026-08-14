'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, Send, Settings, TestTube, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/lib/store';

export default function WhatsAppSettingsPage() {
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingOverdue, setSendingOverdue] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [businessName, setBusinessName] = useState('AL-FALAH TRADERS');
  const [recoverySms, setRecoverySms] = useState(false);
  const [overdueSms, setOverdueSms] = useState(false);
  const [creditSms, setCreditSms] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/whatsapp/settings');
      if (res.ok) {
        const data = await res.json();
        const s = data.settings || {};
        setApiKeyMasked(s.whatsapp_api_key_masked || '');
        setSessionId(s.whatsapp_session_id || '');
        setBusinessName(s.whatsapp_business_name || 'AL-FALAH TRADERS');
        setRecoverySms(s.whatsapp_recovery_sms === 'true');
        setOverdueSms(s.whatsapp_overdue_sms === 'true');
        setCreditSms(s.whatsapp_credit_sms === 'true');
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  if (!user || user.role !== 'admin') return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: any = {
        whatsapp_session_id: sessionId,
        whatsapp_business_name: businessName,
        whatsapp_recovery_sms: recoverySms ? 'true' : 'false',
        whatsapp_overdue_sms: overdueSms ? 'true' : 'false',
        whatsapp_credit_sms: creditSms ? 'true' : 'false',
      };
      if (apiKey) body.whatsapp_api_key = apiKey;

      const res = await apiFetch('/api/whatsapp/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast({ title: 'Saved', description: 'WhatsApp settings updated.' });
        setApiKey('');
        fetchSettings();
      } else {
        toast({ title: 'Error', description: 'Failed to save', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!testPhone.trim()) {
      toast({ title: 'Error', description: 'Enter a phone number first', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const res = await apiFetch('/api/whatsapp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: '✅ Test Sent', description: 'Check your WhatsApp!' });
      } else {
        toast({ title: '❌ Failed', description: data.error || 'Test failed', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    }
    setTesting(false);
  };

  const handleSendOverdue = async () => {
    if (!confirm('Send overdue reminder SMS to all eligible shops?')) return;
    setSendingOverdue(true);
    try {
      const res = await apiFetch('/api/whatsapp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-overdue' }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: 'Overdue SMS Sent',
          description: `Sent: ${data.sent} | Failed: ${data.failed} | Skipped: ${data.skipped}`,
        });
      } else {
        toast({ title: 'Error', description: data.error || 'Failed', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    }
    setSendingOverdue(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          WhatsApp SMS Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Configure WhatsApp API for shopkeeper notifications</p>
      </div>

      {/* API Configuration */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Settings className="h-4 w-4" /> API Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">WasenderAPI Key {apiKeyMasked && <span className="text-muted-foreground">(current: {apiKeyMasked})</span>}</Label>
            <Input
              type="password"
              placeholder={apiKeyMasked ? 'Enter new key to replace' : 'Paste your WasenderAPI key'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Session ID (optional)</Label>
            <Input placeholder="WhatsApp session ID from WasenderAPI" value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Business Name (appears in SMS)</Label>
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* SMS Toggles */}
      <Card>
        <CardHeader><CardTitle className="text-sm">SMS Toggles</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow
            label="Recovery SMS"
            description="Auto-send when admin approves recovery"
            enabled={recoverySms}
            onToggle={() => setRecoverySms(!recoverySms)}
          />
          <ToggleRow
            label="Overdue Reminder SMS"
            description="Send to shops with balance overdue 14+ days"
            enabled={overdueSms}
            onToggle={() => setOverdueSms(!overdueSms)}
          />
          <ToggleRow
            label="Credit Posting SMS"
            description="Auto-send when credit is posted"
            enabled={creditSms}
            onToggle={() => setCreditSms(!creditSms)}
          />
        </CardContent>
      </Card>

      {/* Test SMS */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TestTube className="h-4 w-4" /> Test SMS</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="03001234567" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="flex-1" />
            <Button onClick={handleTest} disabled={testing} variant="outline">
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send Test
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Enter your phone number to verify WhatsApp API is working</p>
        </CardContent>
      </Card>

      {/* Overdue SMS Manual Trigger */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Overdue SMS</CardTitle></CardHeader>
        <CardContent>
          <Button onClick={handleSendOverdue} disabled={sendingOverdue || !overdueSms} variant="outline">
            {sendingOverdue ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send Overdue Reminders Now
          </Button>
          {!overdueSms && <p className="text-xs text-amber-600 mt-2">⚠ Enable Overdue SMS toggle first</p>}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Save Settings
      </Button>
    </div>
  );
}

function ToggleRow({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button onClick={onToggle} className="p-1">
        {enabled ? (
          <ToggleRight className="h-8 w-8 text-emerald-600" />
        ) : (
          <ToggleLeft className="h-8 w-8 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
