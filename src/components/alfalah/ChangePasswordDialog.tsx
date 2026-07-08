'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Shield,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Password Strength Helper ─────────────────────────────────

interface PasswordStrength {
  score: number; // 0-3
  label: string;
  color: string;
  barColor: string;
  textColor: string;
}

function getPasswordStrength(password: string): PasswordStrength {
  if (password.length < 6) {
    return {
      score: 0,
      label: `Too short (${password.length}/6)`,
      color: 'bg-red-500',
      barColor: 'bg-muted',
      textColor: 'text-red-500',
    };
  }

  let score = 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) {
    return {
      score: 1,
      label: 'Weak — add uppercase, numbers, or symbols',
      color: 'bg-red-500',
      barColor: 'bg-red-500',
      textColor: 'text-red-500',
    };
  }
  if (score === 2) {
    return {
      score: 2,
      label: 'Medium — try adding more character variety',
      color: 'bg-amber-500',
      barColor: 'bg-amber-500',
      textColor: 'text-amber-500',
    };
  }
  return {
    score: 3,
    label: 'Strong password',
    color: 'bg-emerald-500',
    barColor: 'bg-emerald-500',
    textColor: 'text-emerald-500',
  };
}

// ── Password Field Component ─────────────────────────────────

function PasswordField({
  id,
  label,
  placeholder,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <div className="relative">
        {id === 'current-password' ? (
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        ) : (
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        )}
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`pl-9 pr-10 h-11 rounded-lg text-sm ${
            error
              ? 'border-red-500 focus-visible:ring-red-500'
              : ''
          }`}
          autoComplete={id === 'current-password' ? 'current-password' : id === 'new-password' ? 'new-password' : 'new-password'}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-500 font-medium flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

// ── Strength Indicator ───────────────────────────────────────

function StrengthIndicator({ password }: { password: string }) {
  if (password.length === 0) return null;

  const strength = getPasswordStrength(password);

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        {[1, 2, 3].map((level) => (
          <div
            key={level}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              strength.score >= level ? strength.barColor : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className={`text-[11px] font-medium ${strength.textColor}`}>
        {strength.label}
      </p>
    </div>
  );
}

// ── Main Dialog Component ────────────────────────────────────

export default function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const user = useAppStore((s) => s.user);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);

  // Validation states
  const currentError = undefined; // Current password has no client-side validation beyond presence
  const newError =
    newPassword.length > 0 && newPassword.length < 8
      ? 'Minimum 6 characters required'
      : newPassword.length > 0 && currentPassword && newPassword === currentPassword
        ? 'New password must be different from current'
        : undefined;
  const confirmError =
    confirmPassword.length > 0 && newPassword !== confirmPassword
      ? 'Passwords do not match'
      : undefined;
  const confirmMatch =
    confirmPassword.length > 0 && newPassword === confirmPassword && newPassword.length >= 8;

  const isValid =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    confirmPassword.length > 0 &&
    newPassword === confirmPassword &&
    newPassword !== currentPassword;

  const resetFields = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }, []);

  const handleOpenChange = useCallback(
    (val: boolean) => {
      onOpenChange(val);
      if (!val) resetFields();
    },
    [onOpenChange, resetFields]
  );

  const handleChangePassword = useCallback(async () => {
    if (!user || !isValid) return;

    setChanging(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast({
          title: 'Password Changed',
          description: 'Your password has been updated successfully.',
        });
        handleOpenChange(false);
      } else {
        toast({
          title: 'Change Failed',
          description: data.error || 'Could not change password.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Change Failed',
        description: 'Network error. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setChanging(false);
    }
  }, [user, isValid, currentPassword, newPassword, handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        {/* Navy Blue Gradient Header */}
        <div className="bg-primary px-6 pt-6 pb-5 relative overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-white/10" />
          <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-white/5" />
          <div className="relative z-10">
            <DialogHeader className="text-left space-y-0">
              <DialogTitle className="text-white text-lg flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/20">
                  <Shield className="h-4.5 w-4.5 text-white" />
                </div>
                Change Password
              </DialogTitle>
              <DialogDescription className="text-blue-200 text-xs mt-1.5">
                Enter your current password and choose a new one.
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        {/* Form Fields */}
        <div className="px-6 py-5 space-y-4">
          <PasswordField
            id="current-password"
            label="Current Password"
            placeholder="Enter current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            disabled={changing}
            error={currentError}
          />

          <div className="space-y-1.5">
            <PasswordField
              id="new-password"
              label="New Password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={setNewPassword}
              disabled={changing}
              error={newError}
            />
            <StrengthIndicator password={newPassword} />
          </div>

          <div className="space-y-1.5">
            <PasswordField
              id="confirm-password"
              label="Confirm New Password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              disabled={changing}
              error={confirmError}
            />
            {confirmMatch && (
              <p className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Passwords match
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 pb-6 pt-0 gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-11 rounded-lg text-sm"
            onClick={() => handleOpenChange(false)}
            disabled={changing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleChangePassword}
            disabled={changing || !isValid}
            className="flex-1 h-11 rounded-lg bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white font-medium text-sm transition-all duration-200 hover:shadow-lg hover:shadow-blue-900/20 disabled:opacity-60"
          >
            {changing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Updating...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-1.5" />
                Update Password
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
