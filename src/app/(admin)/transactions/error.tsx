'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function TransactionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Transactions page error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8">
      <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        The transactions page encountered an error.
      </p>
      {/* Show error details for debugging */}
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 max-w-lg w-full">
        <p className="text-xs font-mono text-red-700 dark:text-red-300 break-all">{error?.message || 'Unknown error'}</p>
        {error?.digest && (
          <p className="text-[10px] text-red-500 mt-1">Digest: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-3">
        <Button type="button" onClick={reset} variant="default">
          Try Again
        </Button>
        <Button type="button" onClick={() => window.location.href = '/dashboard'} variant="outline">
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
