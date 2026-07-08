'use client';

import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';

// ── Types ──────────────────────────────────────────────────────────────────
interface ShopVisit {
  id: string;
  sessionId: string;
  shopId: string | null;
  shopName: string | null;
  orderbookerId: string;
  enterLat: number | null;
  enterLng: number | null;
  exitLat: number | null;
  exitLng: number | null;
  enterTime: string;
  exitTime: string | null;
  timeSpent: number | null;
  distanceToShop: number | null;
  isAutoDetected: boolean;
}

interface SessionData {
  session: {
    id: string;
    orderbookerId: string;
    startTime: string;
    endTime: string | null;
    startLat: number | null;
    startLng: number | null;
    startAddress: string | null;
    endLat: number | null;
    endLng: number | null;
    endAddress: string | null;
    totalDistance: number;
    totalDuration: number | null;
    status: string;
    autoEndReason: string | null;
  };
  latestLocation?: { lat: number; lng: number; accuracy: number | null; recordedAt: string } | null;
  shopVisits: ShopVisit[];
  orderbooker: { id: string; name: string; phone?: string };
  locations?: Array<{
    id: string;
    sessionId: string;
    lat: number;
    lng: number;
    accuracy: number | null;
    speed: number | null;
    recordedAt: string;
  }>;
}

interface RouteMapProps {
  sessions: SessionData[];
  selectedOB?: string | null;
  isLive: boolean;
}

// ── OB Colors ──────────────────────────────────────────────────────────────
const OB_COLORS = ['#4F46E5', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

function getOBColor(index: number): string {
  return OB_COLORS[index % OB_COLORS.length];
}

// ── Custom Icons ───────────────────────────────────────────────────────────

// End marker icon (red)
function createEndIcon(): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#EF4444;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
    className: 'route-end-marker',
  });
}

// Shop visited icon (green)
const shopVisitedIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="22" height="34">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#10b981" stroke="#065f46" stroke-width="1"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  iconSize: [22, 34],
  iconAnchor: [11, 34],
  popupAnchor: [0, -34],
  className: 'custom-leaflet-marker',
});

// Shop unvisited icon (gray)
const shopUnvisitedIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="22" height="34">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#9ca3af" stroke="#6b7280" stroke-width="1"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  iconSize: [22, 34],
  iconAnchor: [11, 34],
  popupAnchor: [0, -34],
  className: 'custom-leaflet-marker',
});

// Start marker icon
function createStartIcon(color: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
    className: 'route-start-marker',
  });
}

// ── Time formatting ────────────────────────────────────────────────────────
function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString('en-PK', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '--:--';
  }
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatMinutes(seconds: number | null): string {
  if (!seconds) return '--';
  const m = Math.round(seconds / 60);
  if (m < 1) return '<1m';
  return `${m}m`;
}

// ── Map Bounds Controller ──────────────────────────────────────────────────
function MapBoundsController({ sessions, selectedOB }: { sessions: SessionData[]; selectedOB?: string | null }) {
  const map = useMap();
  const prevKeyRef = useRef('');

  const boundsKey = useMemo(() => {
    return sessions
      .filter((s) => !selectedOB || s.orderbooker.id === selectedOB)
      .map((s) => s.session.id)
      .join(',');
  }, [sessions, selectedOB]);

  useEffect(() => {
    const filtered = sessions.filter((s) => !selectedOB || s.orderbooker.id === selectedOB);
    if (filtered.length === 0) return;

    const points: [number, number][] = [];

    for (const s of filtered) {
      // Add route points
      if (s.locations && s.locations.length > 0) {
        for (const loc of s.locations) {
          points.push([loc.lat, loc.lng]);
        }
      }
      // Add latest location
      if (s.latestLocation) {
        points.push([s.latestLocation.lat, s.latestLocation.lng]);
      }
      // Add start point
      if (s.session.startLat != null && s.session.startLng != null) {
        points.push([s.session.startLat, s.session.startLng]);
      }
      // Add shop visit points
      for (const v of s.shopVisits) {
        if (v.enterLat != null && v.enterLng != null) {
          points.push([v.enterLat, v.enterLng]);
        }
      }
    }

    if (points.length > 0 && boundsKey !== prevKeyRef.current) {
      const bounds = L.latLngBounds(points);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      }
      prevKeyRef.current = boundsKey;
    }
  }, [sessions, selectedOB, boundsKey, map]);

  return null;
}

// ── Legend Component ────────────────────────────────────────────────────────
function MapLegend({ sessions, selectedOB }: { sessions: SessionData[]; selectedOB?: string | null }) {
  const filteredSessions = sessions.filter((s) => !selectedOB || s.orderbooker.id === selectedOB);

  if (filteredSessions.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-card/95 backdrop-blur-sm rounded-lg border border-border px-3 py-2 shadow-lg">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Orderbookers</p>
      <div className="space-y-1">
        {filteredSessions.map((s, i) => (
          <div key={s.session.id} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: getOBColor(i) }} />
            <span className="text-[11px] text-foreground font-medium">{s.orderbooker.name}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-border mt-1.5 pt-1.5 space-y-1">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-[11px] text-foreground">Visited Shop</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0" />
          <span className="text-[11px] text-foreground">Unvisited Shop</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full border border-dashed border-gray-400 dark:border-gray-500 shrink-0" />
          <span className="text-[11px] text-foreground">30m Proximity</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function RouteTrackerMap({ sessions, selectedOB, isLive }: RouteMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Default center on Pakistan
  const defaultCenter: [number, number] = [30.3753, 69.3451];
  const defaultZoom = 5;

  // Filter sessions based on selected OB
  const filteredSessions = useMemo(
    () => sessions.filter((s) => !selectedOB || s.orderbooker.id === selectedOB),
    [sessions, selectedOB]
  );

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="w-full h-full z-0"
        ref={mapRef}
        scrollWheelZoom={true}
        style={{ background: '#e8f4f8' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBoundsController sessions={sessions} selectedOB={selectedOB} />

        {filteredSessions.map((sessionData, sessionIndex) => {
          const color = getOBColor(sessionIndex);
          const { session, latestLocation, shopVisits, locations } = sessionData;

          return (
            <div key={session.id}>
              {/* Route Polyline from GPS locations */}
              {locations && locations.length > 1 && (
                <Polyline
                  positions={locations.map((l) => [l.lat, l.lng] as [number, number])}
                  pathOptions={{
                    color,
                    weight: 3,
                    opacity: 0.7,
                    lineCap: 'round',
                  }}
                />
              )}

              {/* Start marker */}
              {session.startLat != null && session.startLng != null && (
                <Marker
                  position={[session.startLat, session.startLng]}
                  icon={createStartIcon(color)}
                >
                  <Popup maxWidth={240}>
                    <div className="p-1">
                      <p className="font-semibold text-xs text-foreground">{sessionData.orderbooker.name}</p>
                      <p className="text-[11px] text-muted-foreground">Route Start</p>
                      <p className="text-[11px] text-muted-foreground">{formatTime(session.startTime)}</p>
                      {session.startAddress && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{session.startAddress}</p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Last synced position marker (static) */}
              {latestLocation && (
                <Marker
                  position={[latestLocation.lat, latestLocation.lng]}
                  icon={createStartIcon(color)}
                >
                  <Popup maxWidth={240}>
                    <div className="p-1">
                      <span className="font-semibold text-xs text-foreground">
                        {sessionData.orderbooker.name} - Last Synced
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        Synced at: {formatTime(latestLocation.recordedAt)}
                      </p>
                      {latestLocation.accuracy != null && (
                        <p className="text-[10px] text-muted-foreground">
                          Accuracy: ~{Math.round(latestLocation.accuracy)}m
                        </p>
                      )}
                      {session.totalDistance > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Distance: {(session.totalDistance / 1000).toFixed(1)} km
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* End marker */}
              {session.endLat != null && session.endLng != null && (
                <Marker
                  position={[session.endLat, session.endLng]}
                  icon={createEndIcon()}
                >
                  <Popup maxWidth={240}>
                    <div className="p-1">
                      <p className="font-semibold text-xs text-foreground">{sessionData.orderbooker.name}</p>
                      <p className="text-[11px] text-muted-foreground">Route End</p>
                      {session.endTime && (
                        <p className="text-[11px] text-muted-foreground">{formatTime(session.endTime)}</p>
                      )}
                      {session.endAddress && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{session.endAddress}</p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Shop Visit Markers + Proximity Circles */}
              {shopVisits.map((visit) => {
                if (visit.enterLat == null || visit.enterLng == null) return null;

                return (
                  <div key={visit.id}>
                    {/* 30m Proximity Circle */}
                    <Circle
                      center={[visit.enterLat, visit.enterLng]}
                      radius={30}
                      pathOptions={{
                        color,
                        weight: 1.5,
                        opacity: 0.5,
                        fillColor: color,
                        fillOpacity: 0.08,
                        dashArray: '6 4',
                      }}
                    />
                    {/* Shop Marker */}
                    <Marker
                      position={[visit.enterLat, visit.enterLng]}
                      icon={shopVisitedIcon}
                    >
                      <Popup maxWidth={260}>
                        <div className="p-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="font-semibold text-xs text-foreground">
                              {visit.shopName || 'Unknown Shop'}
                            </span>
                            {visit.isAutoDetected && (
                              <span className="text-[9px] px-1.5 py-0 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 font-bold">
                                AUTO
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            OB: {sessionData.orderbooker.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Enter: {formatTime(visit.enterTime)}
                          </p>
                          {visit.exitTime && (
                            <p className="text-[11px] text-muted-foreground">
                              Exit: {formatTime(visit.exitTime)}
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            Time spent: {formatMinutes(visit.timeSpent)}
                          </p>
                          {visit.distanceToShop != null && (
                            <p className="text-[10px] text-muted-foreground">
                              Distance to shop: {Math.round(visit.distanceToShop)}m
                            </p>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  </div>
                );
              })}
            </div>
          );
        })}
      </MapContainer>

      {/* Legend Overlay */}
      <MapLegend sessions={sessions} selectedOB={selectedOB} />

      {/* No data overlay */}
      {filteredSessions.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-[1000] pointer-events-none">
          <div className="text-center px-6 max-w-md">
            <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-muted/30 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20.25l1.5-1.5 2.572 2.572a2.356 2.356 0 003.396 0l.757-.757a2.355 2.355 0 000-3.33l-2.572-2.572L16.5 12m-3 0l1.5-1.5m-4.5 3l-1.5 1.5M3 3l18 18" />
              </svg>
            </div>
            <h3 className="font-semibold text-sm text-foreground mb-1">No Route Data Available</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
No route sessions found for the selected date. Try a different date or orderbooker.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
