'use client';

import { useSessionManager } from '@/lib/session-manager';
import { useAppStore } from '@/lib/store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, LogOut, Timer } from 'lucide-react';

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function SessionTimeoutDialog() {
  const { isAuthenticated } = useAppStore();
  const { showWarning, countdownSeconds, resetTimer, logout } = useSessionManager();

  if (!isAuthenticated) return null;

  const urgencyColor =
    countdownSeconds <= 60
      ? 'text-red-600 dark:text-red-400'
      : countdownSeconds <= 120
        ? 'text-foreground'
        : 'text-foreground';

  return (
    <Dialog open={showWarning} onOpenChange={(open) => !open && resetTimer()}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden"
        showCloseButton={false}
        onInteractOutside={(e) => {
          // Prevent closing by clicking outside during warning
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          // Allow ESC to reset timer (stay logged in)
          e.preventDefault();
          resetTimer();
        }}
      >
        {/* Amber gradient header */}
        <div className="bg-slate-800 dark:bg-slate-900 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/30">
              <AlertTriangle className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-white">
                Session Timeout Warning
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-300 mt-0.5">
                Your session will expire due to inactivity
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pt-5 pb-2 space-y-4">
          {/* Countdown display */}
          <div className="flex flex-col items-center py-3">
            <div className="flex items-center gap-2 mb-2">
              <Timer className={`h-4 w-4 ${urgencyColor}`} />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Auto-logout in
              </span>
            </div>
            <p
              className={`text-4xl font-bold tabular-nums tracking-tight transition-colors duration-300 ${urgencyColor}`}
            >
              {formatCountdown(countdownSeconds)}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                countdownSeconds <= 60
                  ? 'bg-red-500'
                  : countdownSeconds <= 120
                    ? 'bg-amber-500'
                    : 'bg-amber-400'
              }`}
              style={{
                width: `${(countdownSeconds / 300) * 100}%`,
              }}
            />
          </div>

          <p className="text-sm text-center text-muted-foreground">
            You have been inactive for a while. Would you like to stay logged in?
          </p>
        </div>

        {/* Footer actions */}
        <DialogFooter className="px-6 pb-6 pt-2 gap-3 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={logout}
            className="flex-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:hover:bg-red-950/50 dark:hover:text-red-400"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Log Out
          </Button>
          <Button
            type="button"
            onClick={resetTimer}
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Timer className="h-4 w-4 mr-2" />
            Stay Logged In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
