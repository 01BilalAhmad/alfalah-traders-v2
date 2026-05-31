'use client';

import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Badge } from '@/components/ui/badge';

// ── Custom Marker Icons ────────────────────────────────────────────────────

const startIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#10b981" stroke="#065f46" stroke-width="1"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  iconSize: [28, 42],
  iconAnchor: [14, 42],
  popupAnchor: [0, -42],
  className: 'custom-leaflet-marker',
});

const endIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#ef4444" stroke="#991b1b" stroke-width="1"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  iconSize: [28, 42],
  iconAnchor: [14, 42],
  popupAnchor: [0, -42],
  className: 'custom-leaflet-marker',
});

function createStopIcon(number: number) {
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#3b82f6" stroke="#1d4ed8" stroke-width="1"/>
      <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="system-ui">${number}</text>
    </svg>`,
    iconSize: [28, 42],
    iconAnchor: [14, 42],
    popupAnchor: [0, -42],
    className: 'custom-leaflet-marker',
  });
}

// Small dot icon for unselected route previews
const dotIcon = L.divIcon({
  html: `<div style="width:10px;height:10px;border-radius:50%;background:#6366f1;border:2px solid #4338ca;"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
  className: 'custom-leaflet-marker',
});

// ── Types ──────────────────────────────────────────────────────────────────
interface RouteStop {
  id: string;
  sequenceNumber?: number;
  shopId: string;
  shop: {
    id: string;
    name: string;
    area: string | null;
  };
  arrivalTime: string;
  departureTime: string | null;
  timeSpent: number | null;
  lat: number;
  lng: number;
  recoveryAmount: number | null;
}

interface RouteData {
  id: string;
  orderbookerId: string;
  orderbooker: { id: string; name: string; username: string };
  companyId: string | null;
  company: { id: string; name: string } | null;
  routeDate: string;
  startLat: number;
  startLng: number;
  startTime: string | null;
  endLat: number | null;
  endLng: number | null;
  endTime: string | null;
  totalDistance: number | null;
  status: 'ongoing' | 'completed';
  stopsCount: number;
  stops: RouteStop[];
  pathCoordinates?: Array<{
    lat: number;
    lng: number;
    type: 'start' | 'stop' | 'end';
    stopIndex?: number;
    shopName?: string;
  }>;
  summary?: {
    totalStops: number;
    completedStops: number;
    totalTimeSpent: number;
    totalRecovery: number;
  };
}

interface RouteTrackingMapProps {
  selectedRoute: RouteData | null;
  routes: RouteData[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTimeOfDay(isoStr: string | null): string {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('en-PK', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

function formatTimeMinutes(minutes: number | null): string {
  if (minutes === null || minutes === 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatPKRShort(amount: number | null): string {
  if (amount === null || amount === 0) return '—';
  return `Rs. ${amount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
}

// ── Map Bounds Controller ──────────────────────────────────────────────────
function MapBoundsController({ selectedRoute, routes }: { selectedRoute: RouteData | null; routes: RouteData[] }) {
  const map = useMap();
  const prevRouteIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedRoute && selectedRoute.id !== prevRouteIdRef.current) {
      const points: [number, number][] = [];

      // Add start point
      if (selectedRoute.startLat && selectedRoute.startLng) {
        points.push([selectedRoute.startLat, selectedRoute.startLng]);
      }

      // Add stop points
      if (selectedRoute.stops) {
        for (const stop of selectedRoute.stops) {
          if (stop.lat && stop.lng) {
            points.push([stop.lat, stop.lng]);
          }
        }
      }

      // Add end point
      if (selectedRoute.endLat && selectedRoute.endLng) {
        points.push([selectedRoute.endLat, selectedRoute.endLng]);
      }

      if (points.length > 0) {
        const bounds = L.latLngBounds(points);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
      }

      prevRouteIdRef.current = selectedRoute.id;
    } else if (!selectedRoute && routes.length > 0 && prevRouteIdRef.current !== null) {
      // When deselected, fit all routes
      const allPoints: [number, number][] = [];
      for (const route of routes) {
        if (route.startLat && route.startLng) allPoints.push([route.startLat, route.startLng]);
        if (route.stops) {
          for (const stop of route.stops) {
            if (stop.lat && stop.lng) allPoints.push([stop.lat, stop.lng]);
          }
        }
      }
      if (allPoints.length > 0) {
        const bounds = L.latLngBounds(allPoints);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
        }
      }
      prevRouteIdRef.current = null;
    }
  }, [selectedRoute, routes, map]);

  return null;
}

// ── Main Map Component ─────────────────────────────────────────────────────
export default function RouteTrackingMap({ selectedRoute, routes }: RouteTrackingMapProps) {
  const defaultCenter: [number, number] = [30.3753, 69.3451];
  const defaultZoom = 5;

  // Build polyline coordinates for the selected route
  const selectedPolyline = useMemo(() => {
    if (!selectedRoute) return [];

    const coords: [number, number][] = [];

    // Start point
    if (selectedRoute.startLat && selectedRoute.startLng) {
      coords.push([selectedRoute.startLat, selectedRoute.startLng]);
    }

    // Stop points (in order)
    if (selectedRoute.stops) {
      for (const stop of selectedRoute.stops) {
        if (stop.lat && stop.lng) {
          coords.push([stop.lat, stop.lng]);
        }
      }
    }

    // End point
    if (selectedRoute.endLat && selectedRoute.endLng) {
      coords.push([selectedRoute.endLat, selectedRoute.endLng]);
    }

    return coords;
  }, [selectedRoute]);

  // Build polylines for non-selected routes (preview)
  const otherRoutePolylines = useMemo(() => {
    if (!selectedRoute) return []; // Don't show other routes when no route is selected
    return routes
      .filter((r) => r.id !== selectedRoute.id)
      .map((route) => {
        const coords: [number, number][] = [];
        if (route.startLat && route.startLng) coords.push([route.startLat, route.startLng]);
        if (route.stops) {
          for (const stop of route.stops) {
            if (stop.lat && stop.lng) coords.push([stop.lat, stop.lng]);
          }
        }
        if (route.endLat && route.endLng) coords.push([route.endLat, route.endLng]);
        return { id: route.id, coords, orderbookerName: route.orderbooker.name };
      })
      .filter((r) => r.coords.length >= 2);
  }, [routes, selectedRoute]);

  // All route dots for when no route is selected
  const allRouteDots = useMemo(() => {
    if (selectedRoute) return [];

    const dots: Array<{ lat: number; lng: number; routeId: string; obName: string }> = [];
    for (const route of routes) {
      if (route.startLat && route.startLng) {
        dots.push({ lat: route.startLat, lng: route.startLng, routeId: route.id, obName: route.orderbooker.name });
      }
      if (route.stops) {
        for (const stop of route.stops) {
          if (stop.lat && stop.lng) {
            dots.push({ lat: stop.lat, lng: stop.lng, routeId: route.id, obName: route.orderbooker.name });
          }
        }
      }
    }
    return dots;
  }, [routes, selectedRoute]);

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="w-full h-full rounded-xl z-0"
        scrollWheelZoom={true}
        style={{ background: '#e8f4f8' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBoundsController selectedRoute={selectedRoute} routes={routes} />

        {/* ─── Selected Route Visualization ─── */}
        {selectedRoute && (
          <>
            {/* Route Polyline */}
            {selectedPolyline.length >= 2 && (
              <Polyline
                positions={selectedPolyline}
                pathOptions={{
                  color: '#6366f1',
                  weight: 4,
                  opacity: 0.8,
                  dashArray: null,
                }}
              />
            )}

            {/* Start Marker */}
            {selectedRoute.startLat && selectedRoute.startLng && (
              <Marker
                position={[selectedRoute.startLat, selectedRoute.startLng]}
                icon={startIcon}
              >
                <Popup maxWidth={260}>
                  <div className="p-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h3 className="font-semibold text-sm">Route Start</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedRoute.orderbooker.name} &bull; {formatTimeOfDay(selectedRoute.startTime)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Shop Stop Markers */}
            {selectedRoute.stops?.map((stop, idx) => (
              <Marker
                key={stop.id}
                position={[stop.lat, stop.lng]}
                icon={createStopIcon(idx + 1)}
              >
                <Popup maxWidth={280}>
                  <div className="p-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
                        {idx + 1}
                      </div>
                      <h3 className="font-semibold text-sm">{stop.shop.name}</h3>
                    </div>
                    {stop.shop.area && (
                      <p className="text-xs text-muted-foreground mb-1">
                        Area: {stop.shop.area}
                      </p>
                    )}
                    <div className="space-y-1 text-xs">
                      <p className="text-muted-foreground">
                        Arrival: <span className="font-medium text-foreground">{formatTimeOfDay(stop.arrivalTime)}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Departure: <span className="font-medium text-foreground">{formatTimeOfDay(stop.departureTime)}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Time Spent: <span className="font-medium text-foreground">{formatTimeMinutes(stop.timeSpent)}</span>
                      </p>
                      {stop.recoveryAmount !== null && stop.recoveryAmount > 0 && (
                        <p className="text-emerald-600 font-semibold">
                          Recovery: {formatPKRShort(stop.recoveryAmount)}
                        </p>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* End Marker */}
            {selectedRoute.endLat && selectedRoute.endLng && (
              <Marker
                position={[selectedRoute.endLat, selectedRoute.endLng]}
                icon={endIcon}
              >
                <Popup maxWidth={260}>
                  <div className="p-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="h-5 w-5 rounded-full bg-red-500 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h3 className="font-semibold text-sm">Route End</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatTimeOfDay(selectedRoute.endTime)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Other routes (faded) */}
            {otherRoutePolylines.map((routeLine) => (
              <Polyline
                key={routeLine.id}
                positions={routeLine.coords}
                pathOptions={{
                  color: '#94a3b8',
                  weight: 2,
                  opacity: 0.4,
                  dashArray: '6 4',
                }}
              />
            ))}
          </>
        )}

        {/* ─── No Route Selected — Show all route dots ─── */}
        {!selectedRoute && allRouteDots.map((dot, idx) => (
          <Marker
            key={`${dot.routeId}-${idx}`}
            position={[dot.lat, dot.lng]}
            icon={dotIcon}
          >
            <Popup maxWidth={200}>
              <div className="p-1">
                <p className="text-xs font-semibold">{dot.obName}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Placeholder overlay when no data */}
      {!selectedRoute && allRouteDots.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl z-[1000] pointer-events-none">
          <div className="text-center px-6 max-w-md">
            <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-sm text-foreground mb-1">No Route Data Available</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Route visualization will appear when orderbookers start tracking their routes. Select a route from the table to view it on the map.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
