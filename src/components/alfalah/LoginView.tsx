'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Building2, Eye, EyeOff, LogIn, Loader2, ArrowLeft, KeyRound, CheckCircle2, ShieldCheck, Download, Smartphone } from 'lucide-react';
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

  // Auto-setup: Create admin user if database is empty
  useEffect(() => {
    const saved = localStorage.getItem('alfalah-remembered-username');
    if (saved) {
      setUsername(saved);
      setRememberMe(true);
    }
    // Auto-seed database if empty
    fetch('/api/setup', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          console.log('Auto-setup: Tables & users created');
        }
      })
      .catch(() => {});
  }, []);

  // Calculate password strength
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
      const res = await fetch('/api/auth/login', {
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

      // Save/clear remembered username
      if (rememberMe) {
        localStorage.setItem('alfalah-remembered-username', username.trim());
      } else {
        localStorage.removeItem('alfalah-remembered-username');
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
      const res = await fetch('/api/auth/reset-password', {
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

      // Success — switch to success view
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
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-4 animate-gradient-bg" suppressHydrationWarning
      style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 25%, #1E40AF 50%, #1E3A8A 75%, #0F172A 100%)' }}
    >
      {/* Floating Decorative Shapes */}
      <div className="absolute top-[10%] left-[8%] w-64 h-64 rounded-full bg-white/5 animate-float blur-sm pointer-events-none" />
      <div className="absolute top-[55%] right-[5%] w-48 h-48 rounded-full bg-blue-400/10 animate-float-reverse blur-sm pointer-events-none" />
      <div className="absolute bottom-[15%] left-[20%] w-36 h-36 rounded-full bg-amber-400/8 animate-float-slow blur-sm pointer-events-none" />

      {/* Subtle grid overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Twinkling star particles */}
      <div className="star-twinkle" />
      <div className="star-twinkle" />
      <div className="star-twinkle" />
      <div className="star-twinkle" />
      <div className="star-twinkle" />
      <div className="star-twinkle" />
      <div className="star-twinkle" />
      <div className="star-twinkle" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="rounded-2xl px-8 pt-10 pb-8 text-center bg-white/10 backdrop-blur-md border border-white/20">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm shadow-lg shadow-blue-500/20">
            <Building2 className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Al-Falah Traders</h1>
          <p className="mt-1.5 text-sm text-blue-200">Smart Credit & Route Management System</p>
        </div>

        {/* LOGIN VIEW */}
        {viewMode === 'login' && (
          <Card className={`glass-card rounded-t-none border-t-0 shadow-2xl shadow-blue-900/30 animate-card-glow animate-card-entrance bg-white/95 backdrop-blur-sm transition-all duration-300 ${loginError ? 'border-red-400 ring-2 ring-red-400/30 bg-red-50/90 dark:bg-red-950/30' : ''}`}>
            <CardHeader className="pb-4 pt-6 px-8 transition-colors">
              {loginError && (
                <div className="mb-2 p-2.5 rounded-lg bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-800 animate-fade-in">
                  <p className="text-xs text-red-700 dark:text-red-400 font-medium flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                    Invalid credentials. Please try again.
                  </p>
                </div>
              )}
              <h2 className="text-lg font-semibold text-foreground">Sign In to Your Account</h2>
              <p className="text-sm text-muted-foreground">Enter your credentials to access the system</p>
            </CardHeader>
            <CardContent className="px-8 pb-8">
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
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
                    className="h-11 input-enhanced focus-glow"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
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
                      className="h-11 pr-10 input-enhanced focus-glow"
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
                      <Label htmlFor="remember-me" className="text-sm text-muted-foreground cursor-pointer select-none">Remember me</Label>
                    </div>
                    <button
                      type="button"
                      onClick={switchToForgot}
                      className="text-xs text-primary hover:text-primary/80 font-medium transition-colors hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-white font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-900/20 hover:shadow-blue-900/30 btn-ripple focus-glow disabled:opacity-50 disabled:hover:scale-100 disabled:active:scale-100"
                  style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #3B82F6 100%)' }}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="mr-2 h-4 w-4" />
                  )}
                  {loading ? 'Signing In...' : 'Sign In'}
                </Button>
                <p className="keyboard-hint text-center text-[11px] text-muted-foreground/60">Press Enter to sign in</p>
              </form>
            </CardContent>
          </Card>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {viewMode === 'forgot-password' && (
          <Card className="glass-card rounded-t-none border-t-0 shadow-2xl shadow-blue-900/30 animate-card-glow animate-card-entrance bg-white/95 backdrop-blur-sm">
            <CardHeader className="pb-4 pt-6 px-8">
              <button
                type="button"
                onClick={switchToLogin}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3 group"
              >
                <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Back to login
              </button>
              <div className="flex items-center gap-3 mb-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <KeyRound className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Reset Password</h2>
                  <p className="text-sm text-muted-foreground">Enter your username and new password</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-8 pb-8">
              {resetError && (
                <div className="mb-4 p-2.5 rounded-lg bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-800 animate-fade-in">
                  <p className="text-xs text-red-700 dark:text-red-400 font-medium flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                    {resetError}
                  </p>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-username" className="text-sm font-medium">Username</Label>
                  <Input
                    id="reset-username"
                    type="text"
                    placeholder="Enter your username"
                    value={resetUsername}
                    onChange={(e) => setResetUsername(e.target.value)}
                    autoComplete="username"
                    className="h-11 input-enhanced focus-glow"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-sm font-medium">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      className="h-11 pr-10 input-enhanced focus-glow"
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
                  {/* Password Strength Indicator */}
                  {newPassword && (
                    <div className="space-y-1.5 animate-fade-in">
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
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${getPasswordStrengthColor()}`}
                          style={{
                            width: passwordStrength === 'weak' ? '33%' :
                                   passwordStrength === 'medium' ? '66%' :
                                   passwordStrength === 'strong' ? '100%' : '0%'
                          }}
                        />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className={`inline-block w-1 h-1 rounded-full ${newPassword.length >= 6 ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                          At least 6 characters
                        </p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className={`inline-block w-1 h-1 rounded-full ${/[A-Z]/.test(newPassword) ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                          Uppercase letter
                        </p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className={`inline-block w-1 h-1 rounded-full ${/[0-9]/.test(newPassword) ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                          Number
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-sm font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className={`h-11 pr-10 input-enhanced focus-glow ${
                        confirmPassword && confirmPassword !== newPassword
                          ? 'border-red-400 focus-visible:ring-red-400/30'
                          : confirmPassword && confirmPassword === newPassword
                          ? 'border-green-400 focus-visible:ring-green-400/30'
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
                  className="w-full h-11 text-white font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-900/20 hover:shadow-blue-900/30 btn-ripple focus-glow disabled:opacity-50 disabled:hover:scale-100 disabled:active:scale-100"
                  style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #3B82F6 100%)' }}
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
          <Card className="glass-card rounded-t-none border-t-0 shadow-2xl shadow-blue-900/30 animate-card-entrance bg-white/95 backdrop-blur-sm">
            <CardContent className="px-8 py-10">
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/30 animate-success-bounce">
                  <ShieldCheck className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Password Reset!</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your password has been changed successfully. You can now sign in with your new password.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    switchToLogin();
                    setUsername(resetUsername);
                    setPassword('');
                  }}
                  className="h-11 px-8 text-white font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-900/20 btn-ripple focus-glow"
                  style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #3B82F6 100%)' }}
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In Now
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="mt-6 text-center text-xs text-blue-200/60">
          &copy; {new Date().getFullYear()} Al-Falah Traders. All rights reserved.
        </p>
        <p className="mt-1.5 text-center text-[10px] text-blue-300/40">
          Powered by Al-Falah Systems
        </p>
      </div>
    </div>
  );
}
