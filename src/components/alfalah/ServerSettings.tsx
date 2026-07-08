'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Server,
  Globe,
  Loader2,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  ArrowLeft,
  Trash2,
  Zap,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { getServerUrl, setServerUrl, testConnection, getServerLabel } from '@/lib/api';

interface ServerSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export default function ServerSettings({ open, onOpenChange }: ServerSettingsProps) {
  const [serverUrl, setServerUrlState] = useState('');
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');

  // Load current URL when dialog opens
  useEffect(() => {
    if (open) {
      const saved = getServerUrl();
      setServerUrlState(saved);
      setCurrentUrl(saved);
      setTestStatus('idle');
      setTestMessage('');
    }
  }, [open]);

  const handleTestConnection = useCallback(async () => {
    if (!serverUrl.trim()) {
      toast({ title: 'Error', description: 'Please enter a server URL', variant: 'destructive' });
      return;
    }

    setTestStatus('testing');
    setTestMessage('Testing connection...');

    const result = await testConnection(serverUrl.trim());

    setTestStatus(result.success ? 'success' : 'error');
    setTestMessage(result.message);
  }, [serverUrl]);

  const handleSave = useCallback(() => {
    const trimmed = serverUrl.trim();
    setServerUrl(trimmed);
    setCurrentUrl(trimmed);
    toast({
      title: 'Server Updated',
      description: trimmed
        ? `App will connect to ${getServerLabel()}`
        : 'Using default server (this device)',
    });
    onOpenChange(false);
  }, [serverUrl, onOpenChange]);

  const handleClear = useCallback(() => {
    setServerUrlState('');
    setServerUrl('');
    setCurrentUrl('');
    setTestStatus('idle');
    setTestMessage('');
    toast({
      title: 'Server Cleared',
      description: 'App will use default server (this device)',
    });
    onOpenChange(false);
  }, [onOpenChange]);

  const isChanged = serverUrl.trim() !== currentUrl;
  const isCurrentlyConnected = !!currentUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Server className="h-4.5 w-4.5 text-primary" />
            </div>
            Server Settings
          </DialogTitle>
          <DialogDescription>
            Connect to your server. Change this to connect to any hosting provider (Vercel, Hostinger, etc.)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Current Connection Status */}
          <div className={`rounded-lg p-3 border ${
            isCurrentlyConnected 
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' 
              : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
          }`}>
            <div className="flex items-center gap-2 mb-1.5">
              {isCurrentlyConnected ? (
                <Wifi className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Monitor className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              )}
              <span className={`text-xs font-semibold ${
                isCurrentlyConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-blue-700 dark:text-blue-400'
              }`}>
                {isCurrentlyConnected ? 'Connected to Remote Server' : 'Using Local Server (This Device)'}
              </span>
            </div>
            {isCurrentlyConnected && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 ml-6 font-mono truncate">
                {currentUrl}
              </p>
            )}
            {!isCurrentlyConnected && (
              <p className="text-xs text-blue-600 dark:text-blue-400 ml-6">
                Running on current domain — works for web browser
              </p>
            )}
          </div>

          {/* Server URL Input */}
          <div className="space-y-2">
            <Label htmlFor="server-url" className="text-sm font-medium">
              Server URL
            </Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="server-url"
                type="url"
                placeholder="https://your-server.com"
                value={serverUrl}
                onChange={(e) => {
                  setServerUrlState(e.target.value);
                  setTestStatus('idle');
                  setTestMessage('');
                }}
                className="pl-10 pr-4 h-11"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Enter your server&apos;s full URL. For APK, this is required. For web browser, leave empty to use current domain.
            </p>
          </div>

          {/* Quick URL Templates */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Quick Templates</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setServerUrlState('https://alfalah-traders.vercel.app');
                  setTestStatus('idle');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-[11px] font-medium hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors border border-blue-200 dark:border-blue-800"
              >
                <Zap className="h-3 w-3" />
                Vercel (Live)
              </button>
              <button
                type="button"
                onClick={() => {
                  setServerUrlState('http://192.168.1.100:3000');
                  setTestStatus('idle');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[11px] font-medium hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors border border-amber-200 dark:border-amber-800"
              >
                <Monitor className="h-3 w-3" />
                Local Network
              </button>
              <button
                type="button"
                onClick={() => {
                  setServerUrlState('https://your-hostinger.com');
                  setTestStatus('idle');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 text-[11px] font-medium hover:bg-purple-100 dark:hover:bg-purple-950/50 transition-colors border border-purple-200 dark:border-purple-800"
              >
                <Globe className="h-3 w-3" />
                Hostinger
              </button>
            </div>
          </div>

          {/* Test Connection Result */}
          {testStatus !== 'idle' && (
            <div className={`rounded-lg p-3 border animate-fade-in ${
              testStatus === 'testing' ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' :
              testStatus === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' :
              'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-center gap-2">
                {testStatus === 'testing' && <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />}
                {testStatus === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                {testStatus === 'error' && <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />}
                <span className={`text-xs font-medium ${
                  testStatus === 'testing' ? 'text-blue-700 dark:text-blue-400' :
                  testStatus === 'success' ? 'text-emerald-700 dark:text-emerald-400' :
                  'text-red-700 dark:text-red-400'
                }`}>
                  {testMessage}
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-1">
            <Button
            type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testStatus === 'testing' || !serverUrl.trim()}
              className="flex-1 h-10"
            >
              {testStatus === 'testing' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="mr-2 h-4 w-4" />
              )}
              Test Connection
            </Button>

            {isCurrentlyConnected && (
              <Button
            type="button"
                variant="outline"
                onClick={handleClear}
                className="h-10 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-800"
                title="Clear server URL"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Save Button */}
          <Button
            type="button"
            onClick={handleSave}
            disabled={testStatus === 'testing'}
            className="w-full h-11 text-white font-semibold transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #2563EB 50%, #3B82F6 100%)' }}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {serverUrl.trim() ? `Connect to ${serverUrl.trim().replace(/https?:\/\//, '').split('/')[0]}` : 'Use Default Server'}
          </Button>

          {/* Info */}
          <div className="rounded-lg bg-muted/50 p-3 border border-border/50">
            <div className="flex items-start gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">How it works:</p>
                <p>• <strong>APK/Phone:</strong> Enter your server URL to connect</p>
                <p>• <strong>Web Browser:</strong> Leave empty to use current website</p>
                <p>• You can switch servers anytime — your app will connect to whichever server you set</p>
                <p>• Each server has its own database with its own users and data</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
