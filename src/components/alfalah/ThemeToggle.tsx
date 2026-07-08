'use client';

import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';

// Use a simple client-only pattern to avoid hydration mismatch
import { useHydrated } from '@/lib/use-hydrated';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();

  if (!hydrated) {
    return (
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-foreground hover:bg-muted" aria-label="Toggle theme">
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
            type="button"
      variant="ghost"
      size="icon"
      className={isDark
        ? "h-8 w-8 text-blue-100 hover:bg-white/10 hover:text-white transition-colors"
        : "h-8 w-8 text-foreground hover:bg-muted hover:text-foreground transition-colors"
      }
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
