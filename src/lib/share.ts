// share.ts - Social sharing utilities for Finexa

interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
}

export function shareViaWhatsApp(options: ShareOptions): string {
  const { title, text, url } = options;
  const message = text || title || '';
  const fullUrl = url ? `${url}` : window.location.href;
  const encodedMessage = encodeURIComponent(`${message}\n\n${fullUrl}`);
  return `https://wa.me/?text=${encodedMessage}`;
}

export function shareViaEmail(options: ShareOptions): string {
  const { title, text, url } = options;
  const subject = encodeURIComponent(title || 'Finexa');
  const body = encodeURIComponent(`${text || ''}\n\n${url || window.location.href}`);
  return `mailto:?subject=${subject}&body=${body}`;
}

export async function nativeShare(options: ShareOptions): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({
        title: options.title || 'Finexa',
        text: options.text || '',
        url: options.url || window.location.href,
      });
      return true;
    } catch {
      // User cancelled or share failed
      return false;
    }
  }
  return false;
}

export function copyToClipboard(text: string): Promise<boolean> {
  return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
}
