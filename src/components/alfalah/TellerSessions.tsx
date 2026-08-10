'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Activity, Loader2, RefreshCw, MapPin, Clock, User } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { formatLocalDate, formatLocalDateTime, getLocalDateString } from '@/lib/utils';

interface Session {
  id: string;
  tellerId: string;
  tellerName: string | null;
  tellerUsername: string | null;
  startTime: string;
  endTime: string | null;
  startGpsLat: number | null;
  startGpsLng: number | null;
  startGpsAddress: string | null;
  endGpsLat: number | null;
  endGpsLng: number | null;
  endGpsAddress: string | null;
  area: string | null;
  notes: string | null;
  talliesCount: number;
  discrepanciesCount: number;
  status: string;
}

export default function TellerSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tellers, setTellers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const today = getLocalDateString();
  const monthAgo = (() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  })();
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [tellerFilter, setTellerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchTellers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/tellers');
      if (res.ok) {
        const data = await res.json();
        setTellers((data.tellers || []).map((t: any) => ({ id: t.id, name: t.name })));
      }
    } catch { /* silent */ }
  }, []);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (tellerFilter !== 'all') params.set('tellerId', tellerFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await apiFetch(`/api/teller-sessions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: d.error || 'Failed to load sessions', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, tellerFilter, statusFilter]);

  useEffect(() => { fetchTellers(); }, [fetchTellers]);
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Teller Sessions
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Audit trail of tally sessions — when tellers started/ended market visits, GPS location, and tallies recorded.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Teller</Label>
              <Select value={tellerFilter} onValueChange={setTellerFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tellers</SelectItem>
                  {tellers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="ended">Ended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> Sessions
            <Badge variant="secondary" className="ml-1">{sessions.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Activity className="h-10 w-10 mb-2 opacity-40" />
              <p className="font-medium text-sm">No sessions found</p>
              <p className="text-xs mt-1">Tellers can start sessions from the tally screen.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto sidebar-scroll">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[160px]">Teller</TableHead>
                    <TableHead className="min-w-[150px]">Start</TableHead>
                    <TableHead className="min-w-[150px]">End</TableHead>
                    <TableHead className="min-w-[120px]">Area</TableHead>
                    <TableHead className="min-w-[120px]">Start GPS</TableHead>
                    <TableHead className="text-right min-w-[80px]">Tallies</TableHead>
                    <TableHead className="text-right min-w-[80px]">Discrep.</TableHead>
                    <TableHead className="min-w-[90px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <p className="font-medium text-sm flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {s.tellerName || '—'}
                        </p>
                        {s.tellerUsername && <p className="text-[10px] text-muted-foreground">@{s.tellerUsername}</p>}
                      </TableCell>
                      <TableCell>
                        <p className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> {formatLocalDateTime(new Date(s.startTime))}</p>
                      </TableCell>
                      <TableCell>
                        {s.endTime ? (
                          <p className="text-xs">{formatLocalDateTime(new Date(s.endTime))}</p>
                        ) : (
                          <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" /> Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{s.area || '—'}</TableCell>
                      <TableCell>
                        {s.startGpsLat != null && s.startGpsLng != null ? (
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${s.startGpsLat}&mlon=${s.startGpsLng}#map=16/${s.startGpsLat}/${s.startGpsLng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                          >
                            <MapPin className="h-3 w-3" />
                            {s.startGpsLat.toFixed(3)}, {s.startGpsLng.toFixed(3)}
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{s.talliesCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge variant="outline" className={`text-[10px] ${s.discrepanciesCount > 0 ? 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300' : ''}`}>{s.discrepanciesCount}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800' : 'bg-muted text-muted-foreground'}`}>
                          {s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
