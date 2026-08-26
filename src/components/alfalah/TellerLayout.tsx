'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/alfalah/ThemeToggle';
import { Building2, LogOut, ClipboardCheck, Menu, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface TellerLayoutProps {
  children: React.ReactNode;
}

/**
 * Minimal layout for teller users — header + content only (no sidebar).
 * Tellers have access only to the Market Tally page.
 */
export default function TellerLayout({ children }: TellerLayoutProps) {
  const { user, logout } = useAppStore();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    toast({ title: 'Logged Out', description: 'You have been logged out successfully' });
    router.replace('/');
  };

  return (
    <div className="min-h-dvh flex flex-col bg-white dark:bg-[#121212]">
      {/* Header */}
      <header className="sticky top-0 z-50 h-14 flex items-center justify-between px-4 lg:px-6 bg-white dark:bg-[#1E1E1E] border-b border-slate-200 dark:border-[#2E2E2E]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 rounded-md bg-[#2563EB] flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight tracking-tight truncate">
              Finexa
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-500 leading-tight mt-0.5 flex items-center gap-1">
              <ClipboardCheck className="h-2.5 w-2.5" />
              Market Tally Portal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />

          {/* User Avatar */}
          <div className="hidden sm:flex items-center gap-2 px-2">
            <div className="h-8 w-8 rounded-full bg-[#EFF6FF] dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-xs font-bold text-[#1E40AF] dark:text-blue-400">
              {(user?.name || 'T').charAt(0).toUpperCase()}
            </div>
            <div className="text-left min-w-0">
              <p className="text-xs font-medium text-slate-900 dark:text-white leading-tight truncate max-w-[120px]">
                {user?.name || 'Teller'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-500 leading-tight truncate">
                @{user?.username || 'teller'}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 h-8 w-8 p-0"
            onClick={handleLogout}
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>

          {/* Mobile menu toggle (only shows user info on mobile) */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="sm:hidden h-9 w-9 text-slate-600 dark:text-slate-300"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* Mobile user info dropdown */}
      {menuOpen && (
        <div className="sm:hidden border-b border-slate-200 dark:border-[#2E2E2E] px-4 py-3 bg-white dark:bg-[#1E1E1E] flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-[#EFF6FF] dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-sm font-bold text-[#1E40AF] dark:text-blue-400">
            {(user?.name || 'T').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
              {user?.name || 'Teller'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 truncate">
              @{user?.username || 'teller'}
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto" id="main-scroll-container">
        <div className="p-4 lg:p-6 max-w-7xl mx-auto w-full animate-fade-in">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-[#2E2E2E] px-6 py-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-500">
        <span>&copy; 2026 Finexa. Market Tally Portal.</span>
        <span>v1.0</span>
      </footer>
    </div>
  );
}
