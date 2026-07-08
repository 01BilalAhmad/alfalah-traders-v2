'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import {
  User,
  Phone,
  Shield,
  Clock,
  Smartphone,
  Info,
  X,
  Store,
  CheckCircle2,
  LogOut,
  Pencil,
  Check,
  Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface OrderbookerProfileProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getSessionDuration(): string {
  const loginTime = sessionStorage.getItem('loginTime');
  if (!loginTime) return 'Just now';
  const start = new Date(loginTime).getTime();
  const now = Date.now();
  const diffMs = now - start;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ${diffMin % 60}m ago`;
}

function getDeviceInfo(): string {
  if (typeof navigator === 'undefined') return 'Unknown';
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iOS Device';
  if (/Android/.test(ua)) return 'Android Device';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Web Browser';
}

const APP_VERSION = '1.4.0';

export default function OrderbookerProfile({ open, onOpenChange }: OrderbookerProfileProps) {
  const { user, setUser, logout } = useAppStore();
  const [sessionDuration, setSessionDuration] = useState(getSessionDuration());
  const [currentTime, setCurrentTime] = useState(new Date());

  // Phone edit state
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  // Update session duration every minute
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      setSessionDuration(getSessionDuration());
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, [open]);

  // Record login time on first render
  useEffect(() => {
    if (!sessionStorage.getItem('loginTime')) {
      sessionStorage.setItem('loginTime', new Date().toISOString());
    }
  }, []);

  if (!open || !user) return null;

  const handleSavePhone = async () => {
    const trimmedPhone = phoneInput.trim();
    if (trimmedPhone && !/^[\d+\-\s()]{7,15}$/.test(trimmedPhone)) {
      toast({ title: 'Invalid Phone', description: 'Please enter a valid phone number (7-15 digits)', variant: 'destructive' });
      return;
    }

    setIsSavingPhone(true);
    try {
      const res = await apiFetch('/api/users/phone', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, phone: trimmedPhone }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: 'Error', description: data.error || 'Failed to update phone', variant: 'destructive' });
        return;
      }

      // Update the store with new phone number
      setUser({ ...user, phone: trimmedPhone || undefined });
      setIsEditingPhone(false);
      setPhoneInput('');
      toast({ title: 'Phone Updated', description: trimmedPhone ? `Distributor number set to ${trimmedPhone}` : 'Phone number removed' });
    } catch (err) {
      console.error('Error updating phone:', err);
      toast({ title: 'Error', description: 'Failed to update phone number', variant: 'destructive' });
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleLogout = () => {
    onOpenChange(false);
    logout();
    toast({ title: 'Logged Out', description: 'You have been logged out successfully' });
  };

  const formattedLoginTime = currentTime.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const formattedDate = currentTime.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 block">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Bottom Sheet */}
      <div className="fixed bottom-0 left-0 right-0 bg-card rounded-t-2xl max-h-[85vh] overflow-y-auto shadow-xl animate-in slide-in-from-bottom duration-200 custom-scrollbar">
        {/* Drag Handle */}
        <div className="sticky top-0 z-10 bg-card pt-3 pb-0 px-6 rounded-t-2xl">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-4" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center shadow-md">
                <User className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Account Profile</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Your account information
                </p>
              </div>
            </div>
            <Button
            type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
              aria-label="Close profile"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-8 space-y-5">
          {/* Profile Card with Avatar */}
          <Card className="overflow-hidden border-0 shadow-md">
            <CardContent className="p-0">
              <div className="bg-gradient-to-br from-[#065F46] to-[#047857] p-5 relative overflow-hidden">
                {/* Decorative circles */}
                <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/5" />
                <div className="absolute top-2 right-14 w-8 h-8 rounded-full bg-white/8" />

                <div className="relative z-10 flex items-center gap-4">
                  {/* Initials Avatar */}
                  <div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-lg animate-scale-in">
                    <span className="text-xl font-bold text-white tracking-wide">
                      {getInitials(user.name)}
                    </span>
                  </div>

                  {/* Name & Role */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-white truncate">{user.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="text-[10px] font-medium bg-white/20 text-emerald-100 border-white/10 hover:bg-white/25">
                        <Shield className="h-2.5 w-2.5 mr-1" />
                        Orderbooker
                      </Badge>
                    </div>
                    <p className="text-xs text-emerald-200/70 mt-1">
                      @ {user.username}
                    </p>
                  </div>
                </div>
              </div>

              {/* Account Status Bar */}
              <div className="px-4 py-3 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/20">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Account Active
                  </span>
                </div>
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </CardContent>
          </Card>

          {/* User Details */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Personal Information
              </h4>

              <div className="space-y-3">
                {/* Full Name */}
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium">Full Name</p>
                    <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                  </div>
                </div>

                {/* Username */}
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center shrink-0">
                    <Store className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium">Username</p>
                    <p className="text-sm font-semibold text-foreground truncate">@{user.username}</p>
                  </div>
                </div>

                {/* Phone */}
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center shrink-0">
                    <Phone className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium">Phone (Distributor Number)</p>
                    {isEditingPhone ? (
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          placeholder="03XXXXXXXXX"
                          className="h-8 text-sm flex-1"
                          maxLength={15}
                          disabled={isSavingPhone}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSavePhone();
                            if (e.key === 'Escape') { setIsEditingPhone(false); setPhoneInput(''); }
                          }}
                          autoFocus
                        />
                        <Button
            type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 rounded-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                          aria-label="Save phone"
                          onClick={handleSavePhone}
                          disabled={isSavingPhone}
                        >
                          {isSavingPhone ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
            type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                          aria-label="Cancel phone edit"
                          onClick={() => { setIsEditingPhone(false); setPhoneInput(''); }}
                          disabled={isSavingPhone}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {user.phone || 'Not set'}
                        </p>
                        <Button
            type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 rounded-full text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/50"
                          aria-label="Edit phone"
                          onClick={() => {
                            setPhoneInput(user.phone || '');
                            setIsEditingPhone(true);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Role */}
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center shrink-0">
                    <Shield className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium">Role</p>
                    <p className="text-sm font-semibold text-foreground capitalize">{user.role}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator className="opacity-50" />

          {/* Session Info */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Session Information
                </h4>
              </div>

              <div className="space-y-3">
                {/* Login Time */}
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-sky-50 dark:bg-sky-950/50 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium">Current Time</p>
                    <p className="text-sm font-semibold text-foreground">{formattedLoginTime}</p>
                  </div>
                </div>

                {/* Session Duration */}
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-green-50 dark:bg-green-950/50 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium">Session Duration</p>
                    <p className="text-sm font-semibold text-foreground">{sessionDuration}</p>
                  </div>
                </div>

                {/* Date */}
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium">Today</p>
                    <p className="text-sm font-semibold text-foreground">{formattedDate}</p>
                  </div>
                </div>

                {/* Device Info */}
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center shrink-0">
                    <Smartphone className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium">Device</p>
                    <p className="text-sm font-semibold text-foreground">{getDeviceInfo()}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator className="opacity-50" />

          {/* About Section */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  About
                </h4>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-[#065F46]/5 to-[#047857]/5 dark:from-emerald-950/30 dark:to-green-950/20 border border-emerald-200/50 dark:border-emerald-900/30">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#065F46] to-[#047857] flex items-center justify-center shadow-sm shrink-0">
                  <Store className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">Finexa</p>
                  <p className="text-[10px] text-muted-foreground">Smart Credit &amp; Route Management</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      variant="secondary"
                      className="text-[9px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    >
                      v{APP_VERSION}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground">
                      Orderbooker Portal
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logout Button */}
          <Button
            type="button"
            onClick={handleLogout}
            variant="outline"
            className="w-full h-11 rounded-xl font-semibold text-sm border-red-200 bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:hover:bg-red-950/30 dark:text-red-400 dark:hover:text-red-300 transition-all duration-200"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Log Out
          </Button>
        </div>
      </div>
    </div>
  );
}
