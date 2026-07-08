'use client';

import React from 'react';
import { getBusinessName } from './business-config';

/**
 * Shared print utility for consistent dark-mode-safe printing across the admin panel.
 *
 * Issues solved:
 * 1. Race condition with dark mode — 100ms timeout is too short; we use 300ms.
 * 2. Light-colored dark: text variants could print invisible on white paper — we
 *    inject a temporary <style> that forces all text to black/dark-gray in print.
 * 3. Radix UI dialog overlays/backdrops must be hidden during print.
 * 4. Receipt-content isolation — only the .receipt-content div should be visible
 *    when printing from a Dialog.
 */

const PRINT_STYLE_ID = 'finexa-print-override';

interface PrintOptions {
  /** If true, only .receipt-content should be visible (for Dialog-based receipts) */
  receiptMode?: boolean;
  /** Optional extra CSS to inject for this print job (e.g. @page landscape) */
  extraCSS?: string;
  /** Print delay in ms (default 300) */
  delay?: number;
}

/**
 * Temporarily disables dark mode, injects print-safe styles,
 * calls window.print(), then restores dark mode.
 */
export function handlePrint(options: PrintOptions = {}): void {
  const { receiptMode = false, extraCSS = '', delay = 300 } = options;

  const html = document.documentElement;
  const hadDark = html.classList.contains('dark');

  // 1. Remove dark mode BEFORE printing so CSS variables resolve to light values
  if (hadDark) {
    html.classList.remove('dark');
    html.style.colorScheme = 'light';
  }

  // 2. Inject a temporary <style> with forced light colors and layout overrides
  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  let css = `
    /* Force all text to dark on white background for printing */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    /* Force dark text for common Tailwind color classes in print */
    .text-foreground,
    .text-muted-foreground,
    .text-primary,
    .text-indigo-600, .dark\:text-indigo-400,
    .text-emerald-600, .dark\:text-emerald-400,
    .text-amber-600, .dark\:text-amber-400,
    .text-violet-600, .dark\:text-violet-400,
    .text-blue-600, .dark\:text-blue-400,
    .text-green-600, .dark\:text-green-400,
    .text-red-600, .dark\:text-red-400,
    .text-indigo-700, .dark\:text-indigo-300,
    .text-emerald-700, .dark\:text-emerald-300 {
      color: #111827 !important;
    }

    /* Fix hidden sm:table-cell columns — always show in print */
    .hidden.sm\\:table-cell,
    .hidden.sm\\:inline {
      display: table-cell !important;
    }
    .hidden.sm\\:inline {
      display: inline !important;
    }
    .hidden.sm\\:block {
      display: block !important;
    }
  `;

  if (receiptMode) {
    css += `
      /* Receipt mode: hide everything except the receipt content */
      body > *:not(.receipt-root-wrapper) {
        display: none !important;
      }
      /* Hide Radix UI dialog overlays and backdrops */
      [data-radix-overlay],
      [data-radix-backdrop],
      [data-state="open"][role="dialog"]:not(:has(.receipt-content)) {
        display: none !important;
      }
      /* Force receipt content visible */
      .receipt-content {
        display: block !important;
        position: static !important;
        overflow: visible !important;
        width: 100% !important;
        max-width: 600px !important;
        margin: 0 auto !important;
      }
      /* Force all receipt text to dark */
      .receipt-content * {
        color: #111827 !important;
      }
      .receipt-content .text-white,
      .receipt-content .bg-primary h3,
      .receipt-content .bg-primary p {
        color: #ffffff !important;
      }
      .receipt-content .bg-primary {
        background-color: #4F46E5 !important;
      }
      .receipt-content .text-muted-foreground {
        color: #6B7280 !important;
      }
      .receipt-content .bg-indigo-50 {
        background-color: #EEF2FF !important;
      }
      .receipt-content .border-border\\/40,
      .receipt-content .border-border\\/60 {
        border-color: #E5E7EB !important;
      }
    `;
  }

  if (extraCSS) {
    css += extraCSS;
  }

  style.textContent = css;
  document.head.appendChild(style);

  // 3. Wait for CSS to recalculate, then print
  setTimeout(() => {
    window.print();

    // 4. Cleanup after print dialog closes
    const cleanup = () => {
      const el = document.getElementById(PRINT_STYLE_ID);
      if (el) el.remove();

      // Restore dark mode
      if (hadDark) {
        html.classList.add('dark');
        html.style.colorScheme = 'dark';
      }

      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    // Fallback cleanup in case afterprint doesn't fire
    setTimeout(() => {
      const el = document.getElementById(PRINT_STYLE_ID);
      if (el) el.remove();
      if (hadDark && !html.classList.contains('dark')) {
        html.classList.add('dark');
        html.style.colorScheme = 'dark';
      }
    }, 1500);
  }, delay);
}

/**
 * PrintableSection — a wrapper component that adds the 'print-area' class
 * and ensures the section is properly displayed during print.
 */
export function PrintableSection({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={`print-area ${className}`} id={id}>
      {children}
    </div>
  );
}

/**
 * PrintHeader — a consistent print-only header for reports.
 * Shows company branding with title and date.
 */
export function PrintHeader({
  title,
  subtitle,
  date,
  stats,
}: {
  title: string;
  subtitle?: string;
  date: string;
  stats?: { label: string; value: string }[];
}) {
  return (
    <div className="print-only print-header">
      <div className="print-header-inner">
        <div className="print-header-logo">{getBusinessName()}</div>
        <div className="print-header-divider"></div>
        <div className="print-header-subtitle">{title}</div>
        {subtitle && (
          <div className="print-header-subtitle" style={{ fontSize: '12px', fontWeight: 500 }}>
            {subtitle}
          </div>
        )}
        <div className="print-header-date">{date}</div>
        {stats && stats.length > 0 && (
          <div className="print-header-stats">
            {stats.map((stat, idx) => (
              <div key={idx} className="print-stat">
                <span className="print-stat-value">{stat.value}</span>
                <span className="print-stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
