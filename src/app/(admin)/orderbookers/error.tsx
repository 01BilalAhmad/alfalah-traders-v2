'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function OrderbookersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Orderbookers page error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8">
      <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        The orderbookers page encountered an error. Please try again.
      </p>
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
