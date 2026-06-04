'use client';

import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Loader2 } from 'lucide-react';
import { formatPKR } from '@/lib/utils';

// ── Types (must match parent) ─────────────────────────────────────────────
interface Waypoint {
  id: string;
  routeId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: string;
}

interface RouteStopData {
  id: string;
  routeId: string;
  shopId: string;
  shopName: string;
  shopArea: string | null;
  arrivalTime: string;
  departureTime: string | null;
  timeSpent: number | null;
  lat: number;
  lng: number;
  recoveryAmount: number | null;
  entryType?: string; // "field_visit" or "late_payment"
}

interface RouteDetail {
  id: string;
  orderbookerId: string;
  orderbookerName: string;
  companyId: string | null;
  routeDate: string;
  startLat: number | null;
  startLng: number | null;
  startTime: string;
  endLat: number | null;
  endLng: number | null;
  endTime: string | null;
  totalDistance: number | null;
  totalDuration: number | null;
  status: 'ongoing' | 'completed';
  stopsCount: number;
  waypointsCount: number;
  waypoints: Waypoint[];
  stops: RouteStopData[];
}

interface RouteMapInnerProps {
  routeDetail: RouteDetail | null;
  loading: boolean;
}

// ── Custom Marker Icons ────────────────────────────────────────────────────
const greenIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#10b981" stroke="#065f46" stroke-width="1"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  iconSize: [28, 42],
  iconAnchor: [14, 42],
  popupAnchor: [0, -42],
  className: 'custom-leaflet-marker',
});

const redIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#ef4444" stroke="#991b1b" stroke-width="1"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  iconSize: [28, 42],
  iconAnchor: [14, 42],
  popupAnchor: [0, -42],
  className: 'custom-leaflet-marker',
});

function createOrangeNumberIcon(number: number): L.DivIcon {
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#f97316" stroke="#c2410c" stroke-width="1"/>
      <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="system-ui">${number}</text>
    </svg>`,
    iconSize: [28, 42],
    iconAnchor: [14, 42],
    popupAnchor: [0, -42],
    className: 'custom-leaflet-marker',
  });
}

function createAmberLateIcon(): L.DivIcon {
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#f59e0b" stroke="#92400e" stroke-width="1"/>
      <text x="12" y="14" text-anchor="middle" fill="white" font-size="7" font-weight="bold" font-family="system-ui">LATE</text>
      <text x="12" y="21" text-anchor="middle" fill="white" font-size="7" font-weight="bold" font-family="system-ui">PAY</text>
    </svg>`,
    iconSize: [28, 42],
    iconAnchor: [14, 42],
    popupAnchor: [0, -42],
    className: 'custom-leaflet-marker',
  });
}

// ── Map Bounds Controller ──────────────────────────────────────────────────
function MapBoundsController({ routeDetail }: { routeDetail: RouteDetail | null }) {
  const map = useMap();
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!routeDetail || routeDetail.id === prevIdRef.current) return;

    const allPoints: [number, number][] = [];

    // Add start point
    if (routeDetail.startLat != null && routeDetail.startLng != null) {
      allPoints.push([routeDetail.startLat, routeDetail.startLng]);
    }

    // Add all waypoints
    if (routeDetail.waypoints && routeDetail.waypoints.length > 0) {
      routeDetail.waypoints.forEach((wp) => {
        allPoints.push([wp.lat, wp.lng]);
      });
    }

    // Add all stop points
    if (routeDetail.stops && routeDetail.stops.length > 0) {
      routeDetail.stops.forEach((stop) => {
        if (stop.lat != null && stop.lng != null) {
          allPoints.push([stop.lat, stop.lng]);
        }
      });
    }

    // Add end point
    if (routeDetail.endLat != null && routeDetail.endLng != null) {
      allPoints.push([routeDetail.endLat, routeDetail.endLng]);
    }

    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    }

    prevIdRef.current = routeDetail.id;
  }, [routeDetail, map]);

  return null;
}

// ── Format time for popups ─────────────────────────────────────────────────
function formatPopupTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-PK', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

// ── Main Map Component ─────────────────────────────────────────────────────
export default function RouteMapInner({ routeDetail, loading }: RouteMapInnerProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Default center on Pakistan
  const defaultCenter: [number, number] = [30.3753, 69.3451];
  const defaultZoom = 5;

  // Build polyline positions from: start point + all waypoints + end point
  // This ensures the FULL route path is drawn, not just a straight line
  const polylinePositions: [number, number][] = useMemo(() => {
    if (!routeDetail) return [];

    const positions: [number, number][] = [];

    // 1. Add start point as the first position
    if (routeDetail.startLat != null && routeDetail.startLng != null) {
      positions.push([routeDetail.startLat, routeDetail.startLng]);
    }

    // 2. Add all GPS waypoints (the actual traveled path)
    if (routeDetail.waypoints && routeDetail.waypoints.length > 0) {
      routeDetail.waypoints.forEach((wp) => {
        positions.push([wp.lat, wp.lng]);
      });
    }

    // 3. Add end point as the last position
    if (routeDetail.endLat != null && routeDetail.endLng != null) {
      positions.push([routeDetail.endLat, routeDetail.endLng]);
    }

    return positions;
  }, [routeDetail]);

  // Build a dashed fallback line from start to end when no waypoints exist
  // This shows a "direct" route when GPS data wasn't captured
  const fallbackLine: [number, number][] = useMemo(() => {
    if (!routeDetail) return [];
    if (routeDetail.waypoints && routeDetail.waypoints.length > 0) return []; // real waypoints exist, no fallback needed
    if (routeDetail.startLat == null || routeDetail.startLng == null) return [];
    if (routeDetail.endLat == null || routeDetail.endLng == null) return [];
    return [[routeDetail.startLat, routeDetail.startLng], [routeDetail.endLat, routeDetail.endLng]];
  }, [routeDetail]);

  const hasWaypoints = routeDetail?.waypoints && routeDetail.waypoints.length > 0;

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="w-full h-full rounded-xl z-0"
        ref={mapRef}
        scrollWheelZoom={true}
        style={{ background: '#e8f4f8' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapBoundsController routeDetail={routeDetail} />

        {routeDetail && (
          <>
            {/* Green marker — route start */}
            {routeDetail.startLat != null && routeDetail.startLng != null && (
              <Marker
                position={[routeDetail.startLat, routeDetail.startLng]}
                icon={greenIcon}
              >
                <Popup maxWidth={280}>
                  <div className="p-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <h3 className="font-semibold text-sm text-emerald-700">Route Started</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPopupTime(routeDetail.startTime)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {routeDetail.orderbookerName}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Red marker — route end */}
            {routeDetail.endLat != null && routeDetail.endLng != null && routeDetail.endTime && (
              <Marker
                position={[routeDetail.endLat, routeDetail.endLng]}
                icon={redIcon}
              >
                <Popup maxWidth={280}>
                  <div className="p-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-5 w-5 rounded-full bg-red-100 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <h3 className="font-semibold text-sm text-red-700">Route Ended</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPopupTime(routeDetail.endTime)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Blue solid polyline through start + all waypoints + end (the actual traveled path) */}
            {polylinePositions.length > 1 && (
              <Polyline
                positions={polylinePositions}
                pathOptions={{
                  color: '#3b82f6',
                  weight: 4,
                  opacity: 0.85,
                  smoothFactor: 1,
                  dashArray: undefined,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            )}

            {/* Dashed fallback line — only when NO waypoints exist (shows direct route) */}
            {!hasWaypoints && fallbackLine.length === 2 && (
              <Polyline
                positions={fallbackLine}
                pathOptions={{
                  color: '#ef4444',
                  weight: 3,
                  opacity: 0.6,
                  dashArray: '8, 12',
                  lineCap: 'round',
                }}
              />
            )}

            {/* "No GPS data" indicator when route has no waypoints */}
            {!hasWaypoints && routeDetail.startLat != null && routeDetail.endLat != null && (
              <></>
            )}

            {/* Markers for shop stops — orange for field visit, amber for late payment */}
            {routeDetail.stops && routeDetail.stops.map((stop, idx) => {
              const isLatePayment = stop.entryType === 'late_payment';
              return stop.lat != null && stop.lng != null ? (
                <Marker
                  key={stop.id}
                  position={[stop.lat, stop.lng]}
                  icon={isLatePayment ? createAmberLateIcon() : createOrangeNumberIcon(idx + 1)}
                >
                  <Popup maxWidth={280}>
                    <div className="p-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${isLatePayment ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-600'}`}>
                          {isLatePayment ? 'LP' : idx + 1}
                        </div>
                        <h3 className="font-semibold text-sm text-foreground">{stop.shopName}</h3>
                        {isLatePayment && (
                          <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Late Payment</span>
                        )}
                      </div>
                      {stop.shopArea && (
                        <p className="text-xs text-muted-foreground mb-1">
                          Area: {stop.shopArea}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mb-1">
                        Arrived: {formatPopupTime(stop.arrivalTime)}
                      </p>
                      {stop.timeSpent != null && (
                        <p className="text-xs text-muted-foreground mb-1">
                          Time Spent: {Math.round(stop.timeSpent)} min
                        </p>
                      )}
                      {stop.recoveryAmount != null && stop.recoveryAmount > 0 && (
                        <p className={`text-xs font-bold ${isLatePayment ? 'text-amber-600' : 'text-emerald-600'}`}>
                          Recovery: {formatPKR(stop.recoveryAmount)}
                          {isLatePayment && ' (Office Entry)'}
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ) : null;
            })}
          </>
        )}
      </MapContainer>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl z-[1000] pointer-events-none">
          <div className="text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Loading route...</p>
          </div>
        </div>
      )}

      {/* Placeholder overlay when no route selected */}
      {!routeDetail && !loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl z-[1000] pointer-events-none">
          <div className="text-center px-6 max-w-md">
            <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <h3 className="font-semibold text-sm text-foreground mb-1">Select a Route</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Click on a route in the table below to view its GPS path, waypoints, and shop stops on the map.
            </p>
          </div>
        </div>
      )}

      {/* Waypoint count badge */}
      {routeDetail && (
        <div className="absolute top-3 right-3 z-[1000] pointer-events-none">
          {hasWaypoints ? (
            <div className="bg-blue-500/90 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-md flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              {routeDetail.waypoints.length} GPS points
            </div>
          ) : (
            <div className="bg-amber-500/90 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-md flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              No GPS waypoints
            </div>
          )}
        </div>
      )}
    </div>
  );
}
