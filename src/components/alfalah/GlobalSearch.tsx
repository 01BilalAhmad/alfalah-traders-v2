'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { formatPKR } from '@/lib/utils';
import {
  Search,
  Store,
  Users,
  Loader2,
  ArrowRight,
  Command,
  MapPin,
  Hash,
  Phone,
} from 'lucide-react';

interface ShopResult {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  routeDays: string[];
  status: string;
  balance: number;
  orderbooker: { id: string; name: string } | null;
}

interface OrderbookerResult {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  status: string;
  totalShops: number;
  totalOutstanding: number;
}

type SearchResult =
  | { type: 'shop'; data: ShopResult }
  | { type: 'orderbooker'; data: OrderbookerResult };

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSearchingRef = useRef(false);

  const router = useRouter();

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(-1);
      setHasSearched(false);
      setIsLoading(false);
      // Focus the input after the dialog animation
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      isSearchingRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    }
  }, [open]);

  // Fetch all orderbookers once and cache them
  const cachedOBs = useRef<OrderbookerResult[]>([]);

  const fetchOrderbookers = useCallback(async () => {
    if (cachedOBs.current.length > 0) return cachedOBs.current;
    try {
      const res = await apiFetch('/api/orderbookers');
      if (res.ok) {
        const data = await res.json();
        cachedOBs.current = Array.isArray(data) ? data : [];
        return cachedOBs.current;
      }
    } catch {
      // silent
    }
    return [];
  }, []);

  // Fetch orderbookers cache on mount
  useEffect(() => {
    fetchOrderbookers();
  }, [fetchOrderbookers]);

  // Debounced search
  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setHasSearched(false);
        setIsLoading(false);
        setSelectedIndex(-1);
        return;
      }

      setIsLoading(true);
      setHasSearched(true);
      isSearchingRef.current = true;

      try {
        // Fetch shops with search
        const shopRes = await apiFetch(
          `/api/shops?search=${encodeURIComponent(searchQuery)}&includeInactive=true`
        );
        const shops: ShopResult[] = shopRes.ok && Array.isArray(await shopRes.json())
          ? (await shopRes.clone().json())
          : [];

        // Filter orderbookers client-side
        const allOBs = await fetchOrderbookers();
        const q = searchQuery.toLowerCase();
        const filteredOBs = allOBs.filter(
          (ob) =>
            ob.name.toLowerCase().includes(q) ||
            ob.username.toLowerCase().includes(q) ||
            (ob.phone && ob.phone.includes(q))
        );

        // Build results
        const newResults: SearchResult[] = [
          ...shops.map((shop) => ({ type: 'shop' as const, data: shop })),
          ...filteredOBs.map((ob) => ({ type: 'orderbooker' as const, data: ob })),
        ];

        if (isSearchingRef.current) {
          setResults(newResults);
          setSelectedIndex(newResults.length > 0 ? 0 : -1);
        }
      } catch {
        // silent
      } finally {
        if (isSearchingRef.current) {
          setIsLoading(false);
        }
      }
    },
    [fetchOrderbookers]
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, performSearch]);

  // Keyboard navigation within results
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : results.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < results.length) {
            handleSelect(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [results, selectedIndex]
  );

  const handleSelect = (result: SearchResult) => {
    if (result.type === 'shop') {
      router.push('/shops');
    } else {
      router.push('/orderbookers');
    }
    setOpen(false);
  };

  // Group results by type
  const shopResults = results.filter((r) => r.type === 'shop');
  const obResults = results.filter((r) => r.type === 'orderbooker');

  // Build flat index mapping for keyboard nav
  const getFlatIndex = useCallback(
    (type: 'shop' | 'orderbooker', localIndex: number) => {
      if (type === 'shop') return localIndex;
      return shopResults.length + localIndex;
    },
    [shopResults.length]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-[600px] p-0 gap-0 overflow-hidden rounded-xl border shadow-2xl"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Global Search</DialogTitle>
          <DialogDescription>Search shops and orderbookers</DialogDescription>
        </DialogHeader>

        {/* Search Input */}
        <div className="flex items-center border-b px-4">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search shops, orderbookers, areas..."
            className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 text-base h-12 px-3 placeholder:text-muted-foreground/60"
          />
          {isLoading ? (
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
          ) : (
            <kbd className="hidden sm:inline-flex h-5 shrink-0 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              esc
            </kbd>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
          {!hasSearched && !isLoading && (
            <div className="py-12 px-4 text-center">
              <div className="flex justify-center mb-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Command className="h-6 w-6 text-primary" />
                </div>
              </div>
              <p className="text-sm font-medium text-foreground">
                Start typing to search
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Search across shops and orderbookers
              </p>
              <div className="flex items-center justify-center gap-3 mt-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex h-4 items-center rounded border bg-muted px-1 font-mono text-[9px]">
                    ↑↓
                  </kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex h-4 items-center rounded border bg-muted px-1 font-mono text-[9px]">
                    ↵
                  </kbd>
                  Select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex h-4 items-center rounded border bg-muted px-1 font-mono text-[9px]">
                    esc
                  </kbd>
                  Close
                </span>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="py-12 px-4 text-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Searching...</p>
            </div>
          )}

          {!isLoading && hasSearched && results.length === 0 && (
            <div className="py-12 px-4 text-center">
              <div className="flex justify-center mb-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
              </div>
              <p className="text-sm font-medium text-foreground">
                No results found
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Try a different search term for &quot;{query}&quot;
              </p>
            </div>
          )}

          {!isLoading && results.length > 0 && (
            <div className="py-2">
              {/* Shops Group */}
              {shopResults.length > 0 && (
                <div className="mb-1">
                  <div className="flex items-center gap-2 px-4 py-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Shops
                    </span>
                    <span className="inline-flex h-4 items-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                      {shopResults.length}
                    </span>
                  </div>
                  {shopResults.map((result, idx) => {
                    const shop = result.data;
                    const flatIdx = getFlatIndex('shop', idx);
                    const isSelected = flatIdx === selectedIndex;
                    return (
                      <button
                        key={`shop-${shop.id}`}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(flatIdx)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-100 ${
                          isSelected
                            ? 'bg-primary/8 text-primary'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <div
                          className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-primary/15'
                              : 'bg-muted'
                          }`}
                        >
                          <Store
                            className={`h-4 w-4 ${
                              isSelected ? 'text-primary' : 'text-muted-foreground'
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-medium truncate ${
                              isSelected ? 'text-primary' : 'text-foreground'
                            }`}
                          >
                            {shop.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {shop.area && (
                              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground truncate">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {shop.area}
                              </span>
                            )}
                            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                              <Hash className="h-3 w-3 shrink-0" />
                              {shop.routeDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
                            </span>
                            {shop.orderbooker && (
                              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                                &middot; {shop.orderbooker.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-sm font-semibold ${
                              shop.balance > 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {formatPKR(shop.balance)}
                          </p>
                          {shop.status === 'inactive' && (
                            <span className="text-[10px] text-destructive font-medium">
                              Inactive
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Orderbookers Group */}
              {obResults.length > 0 && (
                <div className={shopResults.length > 0 ? 'border-t' : ''}>
                  <div className="flex items-center gap-2 px-4 py-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Orderbookers
                    </span>
                    <span className="inline-flex h-4 items-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                      {obResults.length}
                    </span>
                  </div>
                  {obResults.map((result, idx) => {
                    const ob = result.data;
                    const flatIdx = getFlatIndex('orderbooker', idx);
                    const isSelected = flatIdx === selectedIndex;
                    return (
                      <button
                        key={`ob-${ob.id}`}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(flatIdx)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-100 ${
                          isSelected
                            ? 'bg-primary/8 text-primary'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <div
                          className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-primary/15'
                              : 'bg-muted'
                          }`}
                        >
                          <Users
                            className={`h-4 w-4 ${
                              isSelected ? 'text-primary' : 'text-muted-foreground'
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-medium truncate ${
                              isSelected ? 'text-primary' : 'text-foreground'
                            }`}
                          >
                            {ob.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-muted-foreground">
                              @{ob.username}
                            </span>
                            {ob.phone && (
                              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground hidden sm:inline">
                                <Phone className="h-3 w-3 shrink-0" />
                                {ob.phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-foreground">
                            {ob.totalShops} shops
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatPKR(ob.totalOutstanding)}
                          </p>
                        </div>
                        {isSelected && (
                          <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2.5 flex items-center justify-between bg-muted/30">
          <span className="text-[11px] text-muted-foreground">
            {hasSearched && !isLoading
              ? `${results.length} result${results.length !== 1 ? 's' : ''} found`
              : 'Search shops & orderbookers'}
          </span>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="inline-flex h-4 items-center rounded border bg-background px-1 font-mono text-[9px] shadow-sm">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex h-4 items-center rounded border bg-background px-1 font-mono text-[9px] shadow-sm">
                ↵
              </kbd>
              Open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex h-4 items-center rounded border bg-background px-1 font-mono text-[9px] shadow-sm">
                esc
              </kbd>
              Close
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
