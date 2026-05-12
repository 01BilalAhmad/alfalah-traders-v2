'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import { Eye, EyeOff, LogIn, Loader2, ArrowLeft, KeyRound, CheckCircle2, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';

type ViewMode = 'login' | 'forgot-password' | 'reset-success';

export default function LoginView() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('login');

  // Forgot password states
  const [resetUsername, setResetUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  // Password strength
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong' | ''>('');

  const { setUser } = useAppStore();

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

  useEffect(() => {
    if (!newPassword) {
      setPasswordStrength('');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordStrength('weak');
    } else if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordStrength('medium');
    } else {
      setPasswordStrength('strong');
    }
  }, [newPassword]);

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
        toast({ title: 'Login Failed', description: data.error || 'Invalid credentials', variant: 'destructive' });
        setLoginError(true);
        setTimeout(() => setLoginError(false), 3000);
        return;
      }

      setLoginError(false);
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
      setLoginError(true);
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (!resetUsername.trim() || !newPassword || !confirmPassword) {
      setResetError('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters');
      return;
    }

    setResetLoading(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: resetUsername.trim(),
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResetError(data.error || 'Failed to reset password');
        return;
      }

      setViewMode('reset-success');
      toast({ title: 'Success!', description: 'Password has been reset successfully' });
    } catch {
      setResetError('Network error. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const switchToForgot = useCallback(() => {
    setResetUsername(username);
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
    setPasswordStrength('');
    setViewMode('forgot-password');
  }, [username]);

  const switchToLogin = useCallback(() => {
    setViewMode('login');
    setResetError('');
  }, []);

  const getPasswordStrengthColor = () => {
    switch (passwordStrength) {
      case 'weak': return 'bg-red-500';
      case 'medium': return 'bg-amber-500';
      case 'strong': return 'bg-green-500';
      default: return '';
    }
  };

  const getPasswordStrengthLabel = () => {
    switch (passwordStrength) {
      case 'weak': return 'Weak';
      case 'medium': return 'Medium';
      case 'strong': return 'Strong';
      default: return '';
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30 px-4">
      <div className="w-full max-w-[380px]">
        {/* LOGIN VIEW */}
        {viewMode === 'login' && (
          <div className="login-card animate-fade-in">
            {/* Logo */}
            <div className="flex justify-center mb-5">
              <Image src="/finexa-wordmark-v2.png" alt="Finexa" width={140} height={140} className="rounded-2xl" priority />
            </div>

            {/* Heading */}
            <h2 className="text-center text-[28px] font-black text-primary tracking-tight">Sign In</h2>

            {/* Error */}
            {loginError && (
              <div className="mt-4 p-3 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 animate-fade-in">
                <p className="text-xs text-red-700 dark:text-red-400 font-medium text-center">
                  Invalid credentials. Please try again.
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
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-foreground transition-colors"
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
                  <Label htmlFor="remember-me" className="text-[11px] text-gray-500 cursor-pointer select-none">Remember me</Label>
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
            <p className="mt-5 text-center text-[10px] text-gray-400">
              &copy; {new Date().getFullYear()} Finexa. All rights reserved.
            </p>
          </div>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {viewMode === 'forgot-password' && (
          <div className="login-card animate-fade-in">
            {/* Back button */}
            <button
              type="button"
              onClick={switchToLogin}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-foreground transition-colors mb-4 group"
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
                <h2 className="text-xl font-black text-primary tracking-tight">Reset Password</h2>
                <p className="text-xs text-gray-500">Enter your username and new password</p>
              </div>
            </div>

            {/* Error */}
            {resetError && (
              <div className="mt-4 p-3 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 animate-fade-in">
                <p className="text-xs text-red-700 dark:text-red-400 font-medium">
                  {resetError}
                </p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Username"
                  value={resetUsername}
                  onChange={(e) => setResetUsername(e.target.value)}
                  autoComplete="username"
                  className="login-input"
                  autoFocus
                />
              </div>

              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="login-input pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPassword && (
                <div className="space-y-1 animate-fade-in px-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-500">Password strength</span>
                    <span className={`text-[11px] font-semibold ${
                      passwordStrength === 'weak' ? 'text-red-500' :
                      passwordStrength === 'medium' ? 'text-amber-500' :
                      passwordStrength === 'strong' ? 'text-green-500' : ''
                    }`}>
                      {getPasswordStrengthLabel()}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${getPasswordStrengthColor()}`}
                      style={{
                        width: passwordStrength === 'weak' ? '33%' :
                               passwordStrength === 'medium' ? '66%' :
                               passwordStrength === 'strong' ? '100%' : '0%'
                      }}
                    />
                  </div>
                </div>
              )}

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
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && confirmPassword === newPassword && (
                <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1 animate-fade-in px-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Passwords match
                </p>
              )}
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-[11px] text-red-500 animate-fade-in px-1">
                  Passwords do not match
                </p>
              )}

              <button
                type="submit"
                disabled={resetLoading}
                className="login-btn"
              >
                {resetLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                {resetLoading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          </div>
        )}

        {/* RESET SUCCESS VIEW */}
        {viewMode === 'reset-success' && (
          <div className="login-card animate-fade-in">
            <div className="text-center space-y-5 py-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 shadow-[0_10px_20px_-5px_rgba(16,185,129,0.2)]">
                <ShieldCheck className="h-7 w-7 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-black text-primary tracking-tight">Password Reset!</h2>
                <p className="mt-2 text-sm text-gray-500">
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
