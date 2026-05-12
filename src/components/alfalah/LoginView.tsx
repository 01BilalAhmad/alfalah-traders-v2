'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      {/* Logo & Brand */}
      <div className="mb-8 text-center">
        <Image src="/finexa-login.png" alt="Finexa" width={180} height={48} className="mx-auto mb-3" priority />
        <p className="text-sm text-muted-foreground">Smart Credit & Route Management</p>
      </div>

      <div className="w-full max-w-sm">
        {/* LOGIN VIEW */}
        {viewMode === 'login' && (
          <Card className={`border shadow-sm animate-fade-in ${loginError ? 'border-red-300 dark:border-red-800' : ''}`}>
            <CardHeader className="pb-4 pt-6 px-6">
              {loginError && (
                <div className="mb-2 p-2 rounded-md bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 animate-fade-in">
                  <p className="text-xs text-red-700 dark:text-red-400 font-medium">
                    Invalid credentials. Please try again.
                  </p>
                </div>
              )}
              <h2 className="text-base font-semibold text-foreground">Sign in to your account</h2>
              <p className="text-sm text-muted-foreground">Enter your credentials below</p>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-sm font-medium">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-10"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked === true)}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <Label htmlFor="remember-me" className="text-xs text-muted-foreground cursor-pointer select-none">Remember me</Label>
                    </div>
                    <button
                      type="button"
                      onClick={switchToForgot}
                      className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 font-medium"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="mr-2 h-4 w-4" />
                  )}
                  {loading ? 'Signing In...' : 'Sign In'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {viewMode === 'forgot-password' && (
          <Card className="border shadow-sm animate-fade-in">
            <CardHeader className="pb-4 pt-6 px-6">
              <button
                type="button"
                onClick={switchToLogin}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3 group"
              >
                <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Back to login
              </button>
              <div className="flex items-center gap-3 mb-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                  <KeyRound className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Reset Password</h2>
                  <p className="text-sm text-muted-foreground">Enter your username and new password</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {resetError && (
                <div className="mb-3 p-2 rounded-md bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 animate-fade-in">
                  <p className="text-xs text-red-700 dark:text-red-400 font-medium">
                    {resetError}
                  </p>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-username" className="text-sm font-medium">Username</Label>
                  <Input
                    id="reset-username"
                    type="text"
                    placeholder="Enter your username"
                    value={resetUsername}
                    onChange={(e) => setResetUsername(e.target.value)}
                    autoComplete="username"
                    className="h-10"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-sm font-medium">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {newPassword && (
                    <div className="space-y-1 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Password strength</span>
                        <span className={`text-[11px] font-semibold ${
                          passwordStrength === 'weak' ? 'text-red-500' :
                          passwordStrength === 'medium' ? 'text-amber-500' :
                          passwordStrength === 'strong' ? 'text-green-500' : ''
                        }`}>
                          {getPasswordStrengthLabel()}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
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
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-sm font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className={`h-10 pr-10 ${
                        confirmPassword && confirmPassword !== newPassword
                          ? 'border-red-300'
                          : confirmPassword && confirmPassword === newPassword
                          ? 'border-green-300'
                          : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPassword && confirmPassword === newPassword && (
                    <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1 animate-fade-in">
                      <CheckCircle2 className="h-3 w-3" />
                      Passwords match
                    </p>
                  )}
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="text-[11px] text-red-500 animate-fade-in">
                      Passwords do not match
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 font-medium"
                  disabled={resetLoading}
                >
                  {resetLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="mr-2 h-4 w-4" />
                  )}
                  {resetLoading ? 'Resetting...' : 'Reset Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* RESET SUCCESS VIEW */}
        {viewMode === 'reset-success' && (
          <Card className="border shadow-sm animate-fade-in">
            <CardContent className="px-6 py-10">
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Password Reset!</h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Your password has been changed successfully. You can now sign in with your new password.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    switchToLogin();
                    setUsername(resetUsername);
                    setPassword('');
                  }}
                  className="h-10 px-6 font-medium"
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In Now
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Finexa. All rights reserved.
        </p>
      </div>
    </div>
  );
}
