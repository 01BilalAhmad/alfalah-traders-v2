'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageCircle, Mail, Link2, Share2, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { shareViaWhatsApp, shareViaEmail, nativeShare, copyToClipboard } from '@/lib/share';

interface ShareMenuProps {
  /** Share context – title, text, url */
  title?: string;
  text?: string;
  url?: string;
  /** Optional custom trigger element */
  trigger?: React.ReactNode;
  /** Optional className for the default trigger button */
  className?: string;
}

export default function ShareMenu({ title, text, url, trigger, className }: ShareMenuProps) {
  const [copied, setCopied] = useState(false);

  const shareOptions = { title: title || 'Finexa', text, url };

  const handleWhatsApp = () => {
    const link = shareViaWhatsApp(shareOptions);
    window.open(link, '_blank', 'noopener');
    toast({ title: 'Opening WhatsApp…', description: 'Share dialog will open shortly.' });
  };

  const handleEmail = () => {
    const link = shareViaEmail(shareOptions);
    window.location.href = link;
    toast({ title: 'Opening email client…', description: 'Draft will open with pre-filled details.' });
  };

  const handleCopy = async () => {
    const targetUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
    const ok = await copyToClipboard(targetUrl);
    if (ok) {
      setCopied(true);
      toast({ title: 'Link copied!', description: 'The URL has been copied to your clipboard.' });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast({ title: 'Copy failed', description: 'Could not copy the link. Please copy it manually.', variant: 'destructive' });
    }
  };

  const handleNative = async () => {
    const ok = await nativeShare(shareOptions);
    if (ok) {
      toast({ title: 'Share dialog opened', description: 'Pick an app to share with.' });
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const defaultTrigger = (
    <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', className)} aria-label="Share">
      <Share2 className="h-4 w-4" />
    </Button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger || defaultTrigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {canNativeShare && (
          <DropdownMenuItem onClick={handleNative} className="gap-2 cursor-pointer">
            <Share2 className="h-4 w-4 text-muted-foreground" />
            <span>Share…</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleWhatsApp} className="gap-2 cursor-pointer">
          <MessageCircle className="h-4 w-4 text-green-600" />
          <span>WhatsApp</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleEmail} className="gap-2 cursor-pointer">
          <Mail className="h-4 w-4 text-blue-600" />
          <span>Email</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopy} className="gap-2 cursor-pointer">
          {copied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Link2 className="h-4 w-4 text-muted-foreground" />
          )}
          <span>{copied ? 'Copied!' : 'Copy Link'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
