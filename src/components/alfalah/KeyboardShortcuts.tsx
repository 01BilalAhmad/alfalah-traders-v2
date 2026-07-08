'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { getViewRoute } from '@/lib/route-map';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Keyboard,
  Command,
  Search,
  ArrowRight,
  Home,
  CreditCard,
  TrendingUp,
  Store,
  Users,
  FileText,
  Shield,
} from 'lucide-react';

interface ShortcutGroup {
  title: string;
  description: string;
  shortcuts: {
    keys: string[];
    label: string;
    icon?: React.ReactNode;
  }[];
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

function isInsideDialog(el: Element | null): boolean {
  if (!el) return false;
  let current: Element | null = el;
  while (current) {
    if (current.getAttribute('role') === 'dialog') return true;
    if (current.getAttribute('data-radix-popper-content-wrapper')) return true;
    if (current.tagName.toLowerCase() === '[data-radix-dialog-content]') return true;
    current = current.parentElement;
  }
  return false;
}

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const { user, isAuthenticated } = useAppStore();
  const router = useRouter();

  // Global Shift+? listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isAuthenticated || !user) return;
      if (e.shiftKey && e.key === '?') {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated, user]);

  // Single-key navigation shortcuts (only when no input/textarea focused and not in dialog)
  useEffect(() => {
    function handleNavigationKey(e: KeyboardEvent) {
      if (!isAuthenticated || !user) return;
      if (open) return; // Don't navigate when shortcuts dialog is open
      if (isEditableElement(document.activeElement)) return;
      if (isInsideDialog(document.activeElement)) return;

      const viewMap: Record<string, string> = {
        '1': 'admin-dashboard',
        '2': 'admin-credit',
        '3': 'admin-recovery',
        '4': 'admin-shops',
        '5': 'admin-orderbookers',
        '6': 'admin-reconciliation',
        '7': 'admin-audit',
        d: 'admin-dashboard',
        c: 'admin-credit',
        r: 'admin-recovery',
        s: 'admin-shops',
      };

      const targetView = viewMap[e.key.toLowerCase()];
      if (targetView && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        router.push(getViewRoute(targetView));
      }
    }

    window.addEventListener('keydown', handleNavigationKey);
    return () => window.removeEventListener('keydown', handleNavigationKey);
  }, [isAuthenticated, user, open, router]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
  }, []);

  const shortcutGroups: ShortcutGroup[] = [
    {
      title: 'General',
      description: 'Global shortcuts',
      shortcuts: [
        {
          keys: ['⌘K', 'Ctrl+K'],
          label: 'Open Search',
          icon: <Search className="h-4 w-4" />,
        },
        {
          keys: ['Shift+?'],
          label: 'Keyboard Shortcuts',
          icon: <Keyboard className="h-4 w-4" />,
        },
      ],
    },
    {
      title: 'Quick Navigation',
      description: 'Jump to admin views (not in input)',
      shortcuts: [
        { keys: ['1'], label: 'Dashboard', icon: <Home className="h-4 w-4" /> },
        { keys: ['2'], label: 'Credit Posting', icon: <CreditCard className="h-4 w-4" /> },
        { keys: ['3'], label: 'Recovery Report', icon: <TrendingUp className="h-4 w-4" /> },
        { keys: ['4'], label: 'Manage Shops', icon: <Store className="h-4 w-4" /> },
        { keys: ['5'], label: 'Orderbookers', icon: <Users className="h-4 w-4" /> },
        { keys: ['6'], label: 'Reconciliation', icon: <FileText className="h-4 w-4" /> },
        { keys: ['7'], label: 'Audit Log', icon: <Shield className="h-4 w-4" /> },
      ],
    },
    {
      title: 'Mnemonic Keys',
      description: 'Letter shortcuts (not in input)',
      shortcuts: [
        { keys: ['D'], label: 'Dashboard', icon: <Home className="h-4 w-4" /> },
        { keys: ['C'], label: 'Credit Posting', icon: <CreditCard className="h-4 w-4" /> },
        { keys: ['R'], label: 'Recovery Report', icon: <TrendingUp className="h-4 w-4" /> },
        { keys: ['S'], label: 'Manage Shops', icon: <Store className="h-4 w-4" /> },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden rounded-xl border shadow-2xl">
        {/* Header with navy blue gradient */}
        <div className="bg-slate-800 dark:bg-slate-900 px-6 py-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-white">
              <div className="h-10 w-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
                <Keyboard className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">Keyboard Shortcuts</p>
                <DialogDescription className="text-slate-300 text-xs mt-0.5">
                  Navigate faster with keyboard shortcuts
                </DialogDescription>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Shortcut Groups */}
        <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-4 space-y-4">
          {shortcutGroups.map((group, gIdx) => (
            <div key={group.title}>
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  {group.title}
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  {group.description}
                </span>
              </div>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.label}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors duration-100 group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                        {shortcut.icon}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {shortcut.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, kIdx) => (
                        <span key={kIdx} className="flex items-center">
                          <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-md border border-border/80 bg-muted/80 px-2 font-mono text-[11px] font-medium text-muted-foreground shadow-sm">
                            {key}
                          </kbd>
                          {kIdx < shortcut.keys.length - 1 && (
                            <span className="text-[10px] text-muted-foreground mx-0.5">
                              <Command className="h-3 w-3 inline" />
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {gIdx < shortcutGroups.length - 1 && (
                <Separator className="mt-4" />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 bg-muted/20 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Press <kbd className="inline-flex h-4 items-center rounded border bg-background px-1 font-mono text-[9px] shadow-sm">Esc</kbd> to close
          </span>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <kbd className="inline-flex h-4 items-center rounded border bg-background px-1 font-mono text-[9px] shadow-sm">Shift</kbd>
            <span>+</span>
            <kbd className="inline-flex h-4 items-center rounded border bg-background px-1 font-mono text-[9px] shadow-sm">?</kbd>
            <ArrowRight className="h-3 w-3 mx-0.5" />
            Show this dialog
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
