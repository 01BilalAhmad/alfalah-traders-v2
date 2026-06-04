'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, CircleMarker, Circle } from 'react-leaflet';
import L from 'leaflet';
import { Badge } from '@/components/ui/badge';
import { formatPKR } from '@/lib/utils';

// Fix default marker icon issue with webpack/next.js
// Leaflet's default icon URLs break with bundlers, so we create custom icons
const defaultIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#ef4444" stroke="#991b1b" stroke-width="1"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  iconSize: [28, 42],
  iconAnchor: [14, 42],
  popupAnchor: [0, -42],
  className: 'custom-leaflet-marker',
});

const activeIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#10b981" stroke="#065f46" stroke-width="1"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  iconSize: [28, 42],
  iconAnchor: [14, 42],
  popupAnchor: [0, -42],
  className: 'custom-leaflet-marker',
});

// Visited shop icon — green with checkmark
const visitedShopIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#10b981" stroke="#065f46" stroke-width="1"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
    <path d="M9.5 12l1.5 1.5 3-3" stroke="#065f46" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  iconSize: [28, 42],
  iconAnchor: [14, 42],
  popupAnchor: [0, -42],
  className: 'custom-leaflet-marker',
});

// Unvisited shop icon — red with X
const unvisitedShopIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#ef4444" stroke="#991b1b" stroke-width="1"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
    <path d="M10 10l4 4M14 10l-4 4" stroke="#991b1b" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </svg>`,
  iconSize: [28, 42],
  iconAnchor: [14, 42],
  popupAnchor: [0, -42],
  className: 'custom-leaflet-marker',
});

// Start point icon — green circle
const startPointIcon = L.divIcon({
  html: `<div style="position:relative;width:20px;height:20px;">
    <div style="position:absolute;inset:0;border-radius:50%;background:#10b981;border:3px solid #065f46;"></div>
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:6px;height:6px;border-radius:50%;background:white;"></div>
  </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
  className: 'custom-leaflet-marker',
});

interface ShopMapMarker {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  balance: number;
  status: string;
  orderbookerName: string;
  routeDays: string[];
  lat: number;
  lng: number;
}

interface LiveOrderbooker {
  orderbookerId: string;
  orderbookerName: string;
  currentLocation: { lat: number; lng: number } | null;
  locations: { lat: number; lng: number; recordedAt: string }[];
  startTime: string;
  shopVisits: {
    shopId: string;
    shopName: string;
    enterTime: string;
    exitTime: string | null;
    timeSpent: number | null;
    enterLat?: number | null;
    enterLng?: number | null;
  }[];
  totalDistance?: number;
  totalDuration?: number;
  startLat?: number | null;
  startLng?: number | null;
  status?: string;
}

interface ShopMapProps {
  markers: ShopMapMarker[];
  liveOrderbookers?: LiveOrderbooker[];
  showLiveTracking?: boolean;
  selectedOB?: string | null;
  isHistoryMode?: boolean;
}

// Component to reset map view when markers change
function MapViewController({ markers, liveOrderbookers, selectedOB }: {
  markers: ShopMapMarker[];
  liveOrderbookers?: LiveOrderbooker[];
  selectedOB?: string | null;
}) {
  const map = useMap();
  const prevKeyRef = useRef('');

  useEffect(() => {
    const allPoints: [number, number][] = [];

    // Add marker positions
    markers.forEach((m) => {
      allPoints.push([m.lat, m.lng]);
    });

    // Add live orderbooker locations
    if (liveOrderbookers) {
      const filteredOBs = selectedOB && selectedOB !== 'all'
        ? liveOrderbookers.filter((ob) => ob.orderbookerId === selectedOB)
        : liveOrderbookers;

      filteredOBs.forEach((ob) => {
        ob.locations.forEach((loc) => {
          allPoints.push([loc.lat, loc.lng]);
        });
        if (ob.currentLocation) {
          allPoints.push([ob.currentLocation.lat, ob.currentLocation.lng]);
        }
        if (ob.startLat != null && ob.startLng != null) {
          allPoints.push([ob.startLat, ob.startLng]);
        }
        ob.shopVisits.forEach((v) => {
          if (v.enterLat != null && v.enterLng != null) {
            allPoints.push([v.enterLat, v.enterLng]);
          }
        });
      });
    }

    const key = `${allPoints.length}-${selectedOB}`;
    if (allPoints.length > 0 && key !== prevKeyRef.current) {
      const bounds = L.latLngBounds(allPoints);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    }
    prevKeyRef.current = key;
  }, [markers, liveOrderbookers, selectedOB, map]);

  return null;
}

// Pulsing blue dot for current position
function PulsingDot({ position }: { position: [number, number] }) {
  return (
    <>
      <Circle
        center={position}
        radius={30}
        pathOptions={{
          color: '#3B82F6',
          fillColor: '#3B82F6',
          fillOpacity: 0.15,
          weight: 1,
        }}
      />
      <CircleMarker
        center={position}
        radius={8}
        pathOptions={{
          color: '#2563EB',
          fillColor: '#3B82F6',
          fillOpacity: 1,
          weight: 2,
        }}
      >
        <Popup>
          <div className="text-xs font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1 animate-pulse" />
            Current Position
          </div>
        </Popup>
      </CircleMarker>
      {/* CSS pulse ring */}
      <CircleMarker
        center={position}
        radius={14}
        pathOptions={{
          color: '#3B82F6',
          fillColor: 'transparent',
          fillOpacity: 0,
          weight: 2,
          className: 'leaflet-pulse-ring',
        }}
      />
    </>
  );
}

// Live route overlay component
function LiveRouteOverlay({ orderbooker, isHistoryMode }: { orderbooker: LiveOrderbooker; isHistoryMode?: boolean }) {
  const routePositions: [number, number][] = orderbooker.locations.map(
    (loc) => [loc.lat, loc.lng] as [number, number]
  );

  const polylineColor = isHistoryMode ? '#9CA3AF' : '#7C3AED'; // grey for history, purple for live
  const polylineWeight = isHistoryMode ? 2 : 3;
  const polylineDashArray = isHistoryMode ? '6 4' : undefined;

  return (
    <>
      {/* Route Polyline */}
      {routePositions.length > 1 && (
        <Polyline
          positions={routePositions}
          pathOptions={{
            color: polylineColor,
            weight: polylineWeight,
            opacity: 0.8,
            dashArray: polylineDashArray,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}

      {/* Start point marker */}
      {(orderbooker.startLat != null && orderbooker.startLng != null) ? (
        <Marker
          position={[orderbooker.startLat, orderbooker.startLng]}
          icon={startPointIcon}
        >
          <Popup>
            <div className="text-xs">
              <div className="font-semibold text-green-700">Route Start</div>
              <div className="text-muted-foreground">
                {new Date(orderbooker.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
          </Popup>
        </Marker>
      ) : routePositions.length > 0 ? (
        <Marker
          position={routePositions[0]}
          icon={startPointIcon}
        >
          <Popup>
            <div className="text-xs">
              <div className="font-semibold text-green-700">Route Start</div>
              <div className="text-muted-foreground">
                {new Date(orderbooker.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
          </Popup>
        </Marker>
      ) : null}

      {/* Current position pulsing dot */}
      {!isHistoryMode && orderbooker.currentLocation && (
        <PulsingDot
          position={[orderbooker.currentLocation.lat, orderbooker.currentLocation.lng]}
        />
      )}

      {/* Visited shop markers on route */}
      {orderbooker.shopVisits.map((visit) => {
        if (visit.enterLat == null || visit.enterLng == null) return null;
        return (
          <Marker
            key={`visit-${visit.shopId}`}
            position={[visit.enterLat, visit.enterLng]}
            icon={visitedShopIcon}
          >
            <Popup>
              <div className="text-xs p-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-semibold">{visit.shopName || 'Unknown Shop'}</span>
                  <Badge className="text-[8px] px-1 py-0 h-3.5 bg-emerald-100 text-emerald-700 border-emerald-200">
                    Visited
                  </Badge>
                </div>
                <div className="text-muted-foreground">
                  {visit.enterTime && new Date(visit.enterTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  {visit.exitTime && ` - ${new Date(visit.exitTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                </div>
                {visit.timeSpent != null && (
                  <div className="text-muted-foreground mt-0.5">
                    Time spent: {Math.round(visit.timeSpent / 60)}m
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export default function ShopMap({ markers, liveOrderbookers, showLiveTracking, selectedOB, isHistoryMode }: ShopMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Default center on Pakistan
  const defaultCenter: [number, number] = [30.3753, 69.3451];
  const defaultZoom = 5;

  // Filter orderbookers based on selection
  const filteredOBs = (showLiveTracking && liveOrderbookers)
    ? (selectedOB && selectedOB !== 'all'
        ? liveOrderbookers.filter((ob) => ob.orderbookerId === selectedOB)
        : liveOrderbookers)
    : [];

  // Determine which shop IDs have been visited by the selected OB
  const visitedShopIds = new Set<string>();
  if (showLiveTracking && filteredOBs.length > 0) {
    filteredOBs.forEach((ob) => {
      ob.shopVisits.forEach((v) => visitedShopIds.add(v.shopId));
    });
  }

  return (
    <div className="relative w-full h-full">
      {/* Inject pulse animation CSS */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes leaflet-pulse-animation {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
          70% { box-shadow: 0 0 0 15px rgba(59, 130, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
        .leaflet-pulse-ring {
          animation: leaflet-pulse-animation 1.5s ease-out infinite;
        }
      `}} />

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
        <MapViewController markers={markers} liveOrderbookers={liveOrderbookers} selectedOB={selectedOB} />

        {/* Regular shop markers */}
        {markers.map((marker) => {
          // In live tracking mode, skip visited shops (they'll be shown by LiveRouteOverlay)
          if (showLiveTracking && visitedShopIds.has(marker.id)) return null;

          // In live tracking mode, show unvisited shops differently
          if (showLiveTracking && filteredOBs.length > 0) {
            return (
              <Marker
                key={marker.id}
                position={[marker.lat, marker.lng]}
                icon={unvisitedShopIcon}
              >
                <Popup maxWidth={280} className="shop-popup">
                  <div className="p-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-sm text-foreground">{marker.name}</h3>
                      <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-red-100 text-red-700 border-red-200">
                        Not Visited
                      </Badge>
                    </div>
                    {marker.ownerName && (
                      <p className="text-xs text-muted-foreground mb-1">
                        Owner: {marker.ownerName}
                      </p>
                    )}
                    {marker.area && (
                      <p className="text-xs text-muted-foreground mb-1">
                        Area: {marker.area}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mb-1">
                      OB: {marker.orderbookerName} &bull; Route: {marker.routeDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
                    </p>
                    <p className={`text-xs font-bold ${marker.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      Balance: {formatPKR(marker.balance)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          }

          return (
            <Marker
              key={marker.id}
              position={[marker.lat, marker.lng]}
              icon={marker.status === 'active' ? activeIcon : defaultIcon}
            >
              <Popup maxWidth={280} className="shop-popup">
                <div className="p-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-sm text-foreground">{marker.name}</h3>
                    <Badge
                      className={`text-[9px] px-1.5 py-0 h-4 font-bold ${
                        marker.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                          : 'bg-red-100 text-red-700 border-red-200'
                      }`}
                    >
                      {marker.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {marker.ownerName && (
                    <p className="text-xs text-muted-foreground mb-1">
                      Owner: {marker.ownerName}
                    </p>
                  )}
                  {marker.area && (
                    <p className="text-xs text-muted-foreground mb-1">
                      Area: {marker.area}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mb-1">
                    OB: {marker.orderbookerName} &bull; Route: {marker.routeDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
                  </p>
                  <p className={`text-xs font-bold ${marker.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    Balance: {formatPKR(marker.balance)}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Live tracking overlays */}
        {showLiveTracking && filteredOBs.map((ob) => (
          <LiveRouteOverlay
            key={ob.orderbookerId}
            orderbooker={ob}
            isHistoryMode={isHistoryMode}
          />
        ))}
      </MapContainer>

      {/* Placeholder overlay when no markers and no live tracking */}
      {markers.length === 0 && (!showLiveTracking || filteredOBs.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl z-[1000] pointer-events-none">
          <div className="text-center px-6 max-w-md">
            <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-sm text-foreground mb-1">No Shop Locations Available</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enable location tracking in the APK to see shop markers on the map. Shop coordinates will appear here once GPS data is captured during visits.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
