'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import { Eye, EyeOff, LogIn, Loader2, ArrowLeft, KeyRound, CheckCircle2, ShieldCheck, Mail, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';

type ViewMode = 'login' | 'forgot-password' | 'forgot-sent' | 'reset-success';

export default function LoginView() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [loginErrorMsg, setLoginErrorMsg] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('login');

  // Forgot password states
  const [resetUsername, setResetUsername] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  // Email configured state — controls messaging in forgot-password view
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null); // null = not checked yet

  const { setUser } = useAppStore();

  // Check if email is configured
  // NOTE: The status endpoint may return 401 if the proxy.ts exception
  // hasn't deployed yet. In that case, assume email IS configured (better
  // to show the forgot-password form and let the API return a proper
  // error if email really isn't set up, than to hide the form entirely).
  useEffect(() => {
    apiFetch('/api/admin/email-config/status')
      .then(r => {
        if (!r.ok) {
          // 401 or other error — assume configured (let forgot-password API handle it)
          setEmailConfigured(true);
          return { configured: true };
        }
        return r.json();
      })
      .then(data => {
        setEmailConfigured(data.configured !== false);
      })
      .catch(() => {
        // Network error — assume configured (let forgot-password API handle it)
        setEmailConfigured(true);
      });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('finexa-remembered-username') || localStorage.getItem('alfalah-remembered-username');
    if (saved) {
      setUsername(saved);
      setRememberMe(true);
    }
    apiFetch('/api/setup', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          console.log('Auto-setup: Tables & users created');
        }
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast({ title: 'Error', description: 'Please enter both username and password', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error || 'Invalid credentials';
        toast({ title: 'Login Failed', description: errorMsg, variant: 'destructive' });
        setLoginErrorMsg(errorMsg);
        setLoginError(true);
        setTimeout(() => { setLoginError(false); setLoginErrorMsg(''); }, 5000);
        return;
      }

      setLoginError(false);
      setLoginErrorMsg('');
      setUser(data.user);

      if (data.token) {
        const { setToken } = useAppStore.getState();
        setToken(data.token);
      }

      if (rememberMe) {
        localStorage.setItem('finexa-remembered-username', username.trim());
      } else {
        localStorage.removeItem('finexa-remembered-username');
      }

      toast({ title: 'Welcome!', description: `Logged in as ${data.user.name}` });
    } catch {
      setLoginErrorMsg('Network error. Please check your connection and try again.');
      setLoginError(true);
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Handle forgot password — send reset email
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (!resetUsername.trim()) {
      setResetError('Please enter your username');
      return;
    }

    setResetLoading(true);
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resetUsername.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Show specific error messages from the API
        setResetError(data.error || 'Failed to send reset email');
        return;
      }

      // Show the actual message from the server (may contain masked email hint)
      setViewMode('forgot-sent');
      toast({ title: 'Reset Link Sent', description: data.message || 'If this is a valid admin account with a registered email, a reset link has been sent.' });
    } catch {
      setResetError('Network error. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const switchToForgot = useCallback(() => {
    setResetUsername(username);
    setResetError('');
    setViewMode('forgot-password');
  }, [username, emailConfigured]);

  const switchToLogin = useCallback(() => {
    setViewMode('login');
    setResetError('');
  }, []);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30 px-4">
      <div className="w-full max-w-[380px]">
        {/* LOGIN VIEW */}
        {viewMode === 'login' && (
          <div className="login-card animate-fade-in">
            {/* Logo */}
            <div className="login-logo-wrap mb-5">
              <Image src="/finexa-wordmark-v2.png" alt="Finexa" width={140} height={140} priority />
            </div>

            {/* Heading */}
            <h2 className="text-center text-[28px] font-black text-primary tracking-tight">Sign In</h2>

            {/* Error */}
            {loginError && (
              <div className="mt-4 p-3 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 animate-fade-in">
                <p className="text-xs text-red-700 dark:text-red-400 font-medium text-center">
                  {loginErrorMsg || 'Invalid credentials. Please try again.'}
                </p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="mt-5 space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="login-input"
                  autoFocus
                />
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="login-input pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400 hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Remember + Forgot */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <Label htmlFor="remember-me" className="text-[11px] text-muted-foreground cursor-pointer select-none">Remember me</Label>
                </div>
                <button
                  type="button"
                  onClick={switchToForgot}
                  className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="login-btn"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="mr-2 h-4 w-4" />
                )}
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>

            {/* Footer */}
            <p className="mt-5 text-center text-[10px] text-gray-400 dark:text-gray-400">
              &copy; 2026 Finexa. All rights reserved. Unauthorized copying, reverse engineering, modification, or distribution of this software is strictly prohibited and punishable under Copyright Ordinance 1962 &amp; PECA 2016.
            </p>
          </div>
        )}

        {/* FORGOT PASSWORD VIEW — Enter username to send reset email */}
        {viewMode === 'forgot-password' && (
          <div className="login-card animate-fade-in">
            {/* Back button */}
            <button
              type="button"
              onClick={switchToLogin}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 group"
            >
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
              Back to login
            </button>

            {/* Heading */}
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <KeyRound className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-black text-primary tracking-tight">Forgot Password</h2>
                <p className="text-xs text-muted-foreground">Enter your admin username to receive a reset link</p>
              </div>
            </div>

            {/* Email not configured warning */}
            {emailConfigured === false && (
              <div className="mt-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    <p className="font-medium">Email not configured</p>
                    <p className="mt-1">Password reset via email is not available yet. The administrator needs to configure email settings from the Settings panel first. Please contact your system administrator or developer for password reset.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Info box — only when email IS configured */}
            {emailConfigured && (
              <div className="mt-4 p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    A password reset link will be sent to the email address registered with your admin account.
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {resetError && (
              <div className="mt-4 p-3 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 animate-fade-in">
                <p className="text-xs text-red-700 dark:text-red-400 font-medium">
                  {resetError}
                </p>
              </div>
            )}

            {/* Form — only show when email is configured */}
            {emailConfigured ? (
              <form onSubmit={handleForgotPassword} className="mt-5 space-y-4">
                <div>
                  <input
                    type="text"
                    placeholder="Admin Username"
                    value={resetUsername}
                    onChange={(e) => setResetUsername(e.target.value)}
                    autoComplete="username"
                    className="login-input"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="login-btn"
                >
                  {resetLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  {resetLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            ) : (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={switchToLogin}
                  className="login-btn"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </button>
              </div>
            )}
          </div>
        )}

        {/* FORGOT SENT VIEW — Confirmation that email was sent */}
        {viewMode === 'forgot-sent' && (
          <div className="login-card animate-fade-in">
            <div className="text-center space-y-5 py-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 shadow-[0_10px_20px_-5px_rgba(59,130,246,0.2)]">
                <Mail className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-black text-primary tracking-tight">Check Your Email</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  If <strong>{resetUsername}</strong> is a valid admin account with a registered email, a password reset link has been sent.
                </p>
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  The reset link expires in 15 minutes. Check your spam folder if you don&apos;t see the email.
                </p>
              </div>
              <button
                onClick={switchToLogin}
                className="login-btn"
              >
                <LogIn className="mr-2 h-4 w-4" />
                Back to Sign In
              </button>
            </div>
          </div>
        )}

        {/* RESET SUCCESS VIEW — After password is reset from email link */}
        {viewMode === 'reset-success' && (
          <div className="login-card animate-fade-in">
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
              <button
                onClick={() => {
                  switchToLogin();
                  setUsername(resetUsername);
                  setPassword('');
                }}
                className="login-btn"
              >
                <LogIn className="mr-2 h-4 w-4" />
                Sign In Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
