'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, KeyRound, ShieldCheck, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      setError('Invalid or missing reset token. Please request a new password reset.');
    } else {
      setTokenValid(true);
    }
  }, [token]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/reset-password-with-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to reset password');
        return;
      }

      setSuccess(true);
      toast({ title: 'Success!', description: 'Password has been reset successfully' });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Invalid token view
  if (tokenValid === false) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30 px-4">
        <div className="w-full max-w-[380px] login-card animate-fade-in">
          <div className="text-center space-y-5 py-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-black text-primary tracking-tight">Invalid Link</h2>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            </div>
            <Button type="button" onClick={() => router.push('/')} className="w-full">
              Go to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Success view
  if (success) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30 px-4">
        <div className="w-full max-w-[380px] login-card animate-fade-in">
          <div className="text-center space-y-5 py-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 shadow-[0_10px_20px_-5px_rgba(16,185,129,0.2)]">
              <ShieldCheck className="h-7 w-7 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-black text-primary tracking-tight">Password Reset!</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your password has been changed successfully. You can now sign in with your new password.
              </p>
            </div>
            <Button type="button" onClick={() => router.push('/')} className="w-full login-btn">
              Sign In Now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Reset form view
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30 px-4">
      <div className="w-full max-w-[380px] login-card animate-fade-in">
        {/* Logo */}
        <div className="flex justify-center mb-5">
          <Image src="/finexa-wordmark-v2.png" alt="Finexa" width={140} height={140} className="rounded-2xl" priority />
        </div>

        {/* Heading */}
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-black text-primary tracking-tight">Set New Password</h2>
            <p className="text-xs text-muted-foreground">Enter your new password below</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 animate-fade-in">
            <p className="text-xs text-red-700 dark:text-red-400 font-medium">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
          <div className="relative">
            <input
              type={showNewPassword ? 'text' : 'password'}
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="login-input pr-11"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400 hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className={`login-input pr-11 ${
                confirmPassword && confirmPassword !== newPassword
                  ? '!border-red-300 !shadow-[0_10px_10px_-5px_rgba(239,68,68,0.15)]'
                  : confirmPassword && confirmPassword === newPassword
                  ? '!border-green-300 !shadow-[0_10px_10px_-5px_rgba(16,185,129,0.15)]'
                  : ''
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400 hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmPassword && confirmPassword === newPassword && (
            <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1 animate-fade-in px-1">
              ✓ Passwords match
            </p>
          )}

          <button type="submit" disabled={loading} className="login-btn">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <p className="mt-5 text-center text-[10px] text-muted-foreground">
          &copy; 2026 Finexa. All rights reserved.
        </p>
      </div>
    </div>
  );
}

function ResetPasswordLoading() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30 px-4">
      <div className="w-full max-w-[380px] login-card animate-fade-in">
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
