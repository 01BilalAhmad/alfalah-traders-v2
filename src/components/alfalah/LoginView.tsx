'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Building2, Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function LoginView() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const { setUser } = useAppStore();

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
      toast({ title: 'Welcome!', description: `Logged in as ${data.user.name}` });
    } catch {
      setLoginError(true);
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-4 animate-gradient-bg"
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

        {/* Login Card with Glow */}
        <Card className={`glass-card rounded-t-none border-t-0 shadow-2xl shadow-blue-900/30 animate-card-glow animate-card-entrance bg-white/95 backdrop-blur-sm transition-all duration-300 ${loginError ? 'border-red-400 ring-2 ring-red-400/30 bg-red-50/90 dark:bg-red-950/30' : ''}`}>
          <CardHeader className="pb-4 pt-6 px-8 transition-colors">
            {loginError && (
              <div className="mb-2 p-2 rounded-lg bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-800 animate-fade-in">
                <p className="text-xs text-red-700 dark:text-red-400 font-medium">Invalid credentials. Please try again.</p>
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
                <div className="text-right">
                  <span className="login-link cursor-default">Forgot Password?</span>
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
              <p className="keyboard-hint">Press Enter to sign in</p>
            </form>
          </CardContent>
        </Card>

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
