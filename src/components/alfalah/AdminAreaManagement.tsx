'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  MapPin, Plus, Trash2, Edit2, Check, X, Search, Loader2,
  Upload, AlertCircle,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

interface Area {
  id: string;
  name: string;
  description: string | null;
  shopCount: number;
  createdAt: string;
}

interface Shop {
  id: string;
  name: string;
  area: string | null;
  ownerName: string | null;
  routeDays: string[];
  orderbooker?: { id: string; name: string };
  orderbookerId?: string;
}

interface Orderbooker {
  id: string;
  name: string;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

export default function AdminAreaManagement() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAreaName, setNewAreaName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Bulk assign state
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [selectedShopIds, setSelectedShopIds] = useState<Set<string>>(new Set());
  const [shopSearch, setShopSearch] = useState('');
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [filterDay, setFilterDay] = useState<string>('');
  const [filterOB, setFilterOB] = useState<string>('');

  // Fetch areas + shops + orderbookers
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [areaRes, shopRes, obRes] = await Promise.all([
        apiFetch('/api/areas'),
        apiFetch('/api/shops?showZeroBalance=true&includeInactive=true'),
        apiFetch('/api/orderbookers?status=active'),
      ]);
      if (areaRes.ok) {
        const data = await areaRes.json();
        setAreas(data.areas || []);
      }
      if (shopRes.ok) {
        const data = await shopRes.json();
        setShops(Array.isArray(data) ? data : []);
      }
      if (obRes.ok) {
        const data = await obRes.json();
        setOrderbookers(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Create area
  const handleCreateArea = async () => {
    if (!newAreaName.trim()) return;
    try {
      const res = await apiFetch('/api/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAreaName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      toast({ title: 'Area Created', description: newAreaName.trim() });
      setNewAreaName('');
      fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // Edit area
  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      const res = await apiFetch(`/api/areas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      toast({ title: 'Area Updated', description: editingName.trim() });
      setEditingId(null);
      setEditingName('');
      fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // Delete area
  const handleDeleteArea = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? Shops assigned to this area will become Unassigned.`)) return;
    try {
      const res = await apiFetch(`/api/areas/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Area Deleted', description: name });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // Auto-extract areas from existing shops
  const handleAutoExtract = async () => {
    setExtracting(true);
    try {
      const res = await apiFetch('/api/areas/auto-extract', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      toast({
        title: 'Areas Extracted',
        description: data.message || `${data.created} created, ${data.skipped} existed`,
      });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setExtracting(false);
    }
  };

  // Bulk assign
  const handleBulkAssign = async () => {
    if (!selectedArea || selectedShopIds.size === 0) {
      toast({ title: 'Warning', description: 'Select area and at least one shop', variant: 'destructive' });
      return;
    }
    setAssigning(true);
    try {
      const res = await apiFetch('/api/areas/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          areaName: selectedArea,
          shopIds: Array.from(selectedShopIds),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      toast({ title: 'Assigned!', description: `${data.assignedCount} shops → ${selectedArea}` });
      setSelectedShopIds(new Set());
      fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setAssigning(false);
    }
  };

  // Toggle shop selection
  const toggleShop = (shopId: string) => {
    setSelectedShopIds(prev => {
      const next = new Set(prev);
      if (next.has(shopId)) next.delete(shopId);
      else next.add(shopId);
      return next;
    });
  };

  // Filtered shops for bulk assign
  const filteredShops = shops.filter(s => {
    // Unassigned filter
    if (filterUnassigned && s.area) return false;
    // Day filter
    if (filterDay && (!s.routeDays || !s.routeDays.includes(filterDay))) return false;
    // Orderbooker filter
    if (filterOB && s.orderbookerId !== filterOB && s.orderbooker?.id !== filterOB) return false;
    // Search
    if (shopSearch.trim()) {
      const q = shopSearch.toLowerCase();
      return s.name.toLowerCase().includes(q) || (s.area || '').toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MapPin className="h-7 w-7 text-blue-600" />
            Area Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create areas, assign shops in bulk, manage routes
          </p>
        </div>
        <Button variant="outline" onClick={handleAutoExtract} disabled={extracting}>
          {extracting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
          Auto-Extract from Shops
        </Button>
      </div>

      {/* Create Area + Areas List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Areas ({areas.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Create new area */}
          <div className="flex gap-2">
            <Input
              placeholder="Enter area name..."
              value={newAreaName}
              onChange={e => setNewAreaName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateArea()}
              className="max-w-xs"
            />
            <Button onClick={handleCreateArea} disabled={!newAreaName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Add Area
            </Button>
          </div>

          {/* Areas table */}
          {areas.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No areas yet. Create one above or click "Auto-Extract".</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Area Name</TableHead>
                  <TableHead className="text-xs text-center">Shops</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.map(area => (
                  <TableRow key={area.id}>
                    <TableCell>
                      {editingId === area.id ? (
                        <div className="flex gap-1">
                          <Input
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            className="h-8 max-w-[200px]"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleSaveEdit(area.id)}
                          />
                          <Button size="icon" className="h-8 w-8" onClick={() => handleSaveEdit(area.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setEditingId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="font-medium text-sm">{area.name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{area.shopCount}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId !== area.id && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon" variant="ghost" className="h-8 w-8"
                            onClick={() => { setEditingId(area.id); setEditingName(area.name); }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-8 w-8 text-red-500"
                            onClick={() => handleDeleteArea(area.id, area.name)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Bulk Assign */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Bulk Assign Area to Shops
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Area selector + search + filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Select Area</Label>
              <select
                value={selectedArea}
                onChange={e => setSelectedArea(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Select Area —</option>
                {areas.map(a => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Filter by Day</Label>
              <select
                value={filterDay}
                onChange={e => setFilterDay(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All Days</option>
                {DAYS.map(d => (
                  <option key={d} value={d}>{DAY_LABELS[d]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Filter by Orderbooker</Label>
              <select
                value={filterOB}
                onChange={e => setFilterOB(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All Orderbookers</option>
                {orderbookers.map(ob => (
                  <option key={ob.id} value={ob.id}>{ob.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-xs">Search Shops</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search shop name..."
                  value={shopSearch}
                  onChange={e => setShopSearch(e.target.value)}
                  className="h-9 pl-8"
                />
              </div>
            </div>
            <Button
              variant={filterUnassigned ? "default" : "outline"}
              onClick={() => setFilterUnassigned(!filterUnassigned)}
              className="h-9"
            >
              {filterUnassigned ? "✓ Unassigned Only" : "Unassigned Only"}
            </Button>
          </div>

          {/* Selected count + actions */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Badge variant={selectedShopIds.size > 0 ? "default" : "secondary"}>
                {selectedShopIds.size} selected
              </Badge>
              <Button
                variant="ghost" size="sm"
                onClick={() => setSelectedShopIds(new Set(filteredShops.map(s => s.id)))}
              >
                Select All ({filteredShops.length})
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => setSelectedShopIds(new Set())}
              >
                Clear
              </Button>
            </div>
            <Button
              onClick={handleBulkAssign}
              disabled={assigning || !selectedArea || selectedShopIds.size === 0}
            >
              {assigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Assign {selectedShopIds.size > 0 ? `(${selectedShopIds.size})` : ''}
            </Button>
          </div>

          {/* Shops list with checkboxes */}
          <div className="max-h-[400px] overflow-y-auto border rounded-lg">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-10 text-xs">✓</TableHead>
                  <TableHead className="text-xs">Shop Name</TableHead>
                  <TableHead className="text-xs">Current Area</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">OB</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredShops.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                      No shops found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredShops.map(shop => (
                    <TableRow
                      key={shop.id}
                      className={selectedShopIds.has(shop.id) ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted/30'}
                      onClick={() => toggleShop(shop.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedShopIds.has(shop.id)}
                          onChange={() => {}} // handled by row click
                          className="h-4 w-4 rounded cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="text-sm font-medium">{shop.name}</TableCell>
                      <TableCell className="text-sm">
                        {shop.area ? (
                          <Badge variant="outline">{shop.area}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                        {shop.orderbooker?.name || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                        {shop.routeDays && shop.routeDays.length > 0
                          ? shop.routeDays.map(d => DAY_LABELS[d]?.slice(0, 3) || d).join(', ')
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
