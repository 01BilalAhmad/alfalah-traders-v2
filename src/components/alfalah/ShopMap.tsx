'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { Badge } from '@/components/ui/badge';
import { formatPKR } from '@/lib/utils';

// Fix default marker icon issue with webpack/next.js
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

// Live orderbooker icon - pulsing blue dot
const liveOBIcon = L.divIcon({
  html: `<div style="position:relative;width:40px;height:40px;">
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;border-radius:50%;background:rgba(59,130,246,0.2);animation:pulse-ring 2s ease-out infinite;"></div>
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 8px rgba(59,130,246,0.5);"></div>
  </div>
  <style>@keyframes pulse-ring{0%{transform:translate(-50%,-50%) scale(0.5);opacity:1}100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}}</style>
  </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
  className: 'live-ob-marker',
});

// Start point icon - green circle
const startIcon = L.divIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#10b981;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -10],
  className: 'start-marker',
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
  routeId: string;
  orderbookerId: string;
  orderbookerName: string;
  orderbookerPhone: string | null;
  startTime: string;
  duration: string;
  durationMinutes: number;
  currentLat: number;
  currentLng: number;
  lastUpdated: string;
  waypointsCount: number;
  nearShop: { id: string; name: string; area: string | null; distance: number } | null;
  pathPoints: { lat: number; lng: number; timestamp: string }[];
}

interface ShopMapProps {
  markers: ShopMapMarker[];
  liveOrderbookers?: LiveOrderbooker[];
  showLiveTracking?: boolean;
  selectedOB?: string | null;
}

// Component to reset map view when markers change
function MapViewController({ markers, liveOrderbookers, showLiveTracking }: {
  markers: ShopMapMarker[];
  liveOrderbookers?: LiveOrderbooker[];
  showLiveTracking?: boolean;
}) {
  const map = useMap();
  const prevLengthRef = useRef(0);

  useEffect(() => {
    const allPoints: [number, number][] = [];

    if (showLiveTracking && liveOrderbookers && liveOrderbookers.length > 0) {
      liveOrderbookers.forEach(ob => {
        allPoints.push([ob.currentLat, ob.currentLng]);
      });
    }

    markers.forEach(m => {
      allPoints.push([m.lat, m.lng]);
    });

    if (allPoints.length > 0 && allPoints.length !== prevLengthRef.current) {
      const bounds = L.latLngBounds(allPoints);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    }
    prevLengthRef.current = allPoints.length;
  }, [markers, liveOrderbookers, showLiveTracking, map]);

  return null;
}

export default function ShopMap({ markers, liveOrderbookers = [], showLiveTracking = false, selectedOB = null }: ShopMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  const defaultCenter: [number, number] = [30.3753, 69.3451];
  const defaultZoom = 5;

  // Filter live orderbookers based on selection
  const filteredLiveOBs = selectedOB
    ? liveOrderbookers.filter(ob => ob.orderbookerId === selectedOB)
    : liveOrderbookers;

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
        <MapViewController markers={markers} liveOrderbookers={filteredLiveOBs} showLiveTracking={showLiveTracking} />

        {/* Shop markers */}
        {markers.map((marker) => (
          <Marker
            key={`shop-${marker.id}`}
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
        ))}

        {/* Live orderbooker positions + route paths */}
        {showLiveTracking && filteredLiveOBs.map((ob) => (
          <LiveTrackingLayer key={ob.routeId} orderbooker={ob} />
        ))}
      </MapContainer>

      {/* Placeholder overlay when no markers */}
      {markers.length === 0 && filteredLiveOBs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl z-[1000] pointer-events-none">
          <div className="text-center px-6 max-w-md">
            <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-sm text-foreground mb-1">No Locations Available</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {showLiveTracking
                ? 'No orderbookers are currently on an active route. When an orderbooker starts a route, their live position will appear here.'
                : 'Enable location tracking in the APK to see shop markers on the map.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-component for each live orderbooker's tracking layer
function LiveTrackingLayer({ orderbooker }: { orderbooker: LiveOrderbooker }) {
  const pathPositions: [number, number][] = orderbooker.pathPoints.map(p => [p.lat, p.lng]);

  // Add start and current position to path if there are waypoints
  if (pathPositions.length > 0) {
    // Prepend start position
    pathPositions.unshift([orderbooker.pathPoints[0].lat, orderbooker.pathPoints[0].lng]);
    // Append current position
    pathPositions.push([orderbooker.currentLat, orderbooker.currentLng]);
  }

  const lastUpdatedTime = new Date(orderbooker.lastUpdated);
  const timeAgo = Math.round((Date.now() - lastUpdatedTime.getTime()) / 1000);
  const timeAgoStr = timeAgo < 60 ? `${timeAgo}s ago` : `${Math.round(timeAgo / 60)}m ago`;

  return (
    <>
      {/* Start point marker */}
      {orderbooker.pathPoints.length > 0 && (
        <Marker
          position={[orderbooker.pathPoints[0].lat, orderbooker.pathPoints[0].lng]}
          icon={startIcon}
        >
          <Popup>
            <div className="p-1">
              <div className="font-semibold text-xs text-emerald-600">Route Start</div>
              <div className="text-[10px] text-muted-foreground">
                {new Date(orderbooker.startTime).toLocaleTimeString()}
              </div>
            </div>
          </Popup>
        </Marker>
      )}

      {/* Route path polyline */}
      {pathPositions.length > 1 && (
        <Polyline
          positions={pathPositions}
          pathOptions={{
            color: '#3b82f6',
            weight: 4,
            opacity: 0.7,
            dashArray: '8, 6',
          }}
        />
      )}

      {/* Live position marker (pulsing blue dot) */}
      <Marker
        position={[orderbooker.currentLat, orderbooker.currentLng]}
        icon={liveOBIcon}
      >
        <Popup maxWidth={300} className="live-ob-popup">
          <div className="p-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-sm">{orderbooker.orderbookerName}</h3>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] text-green-600 font-medium">LIVE</span>
                </div>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Route Duration:</span>
                <span className="font-medium">{orderbooker.duration}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Waypoints:</span>
                <span className="font-medium">{orderbooker.waypointsCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Update:</span>
                <span className="font-medium">{timeAgoStr}</span>
              </div>

              {orderbooker.nearShop && (
                <div className="mt-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Near Shop
                  </div>
                  <div className="text-emerald-600 font-medium">{orderbooker.nearShop.name}</div>
                  {orderbooker.nearShop.area && (
                    <div className="text-emerald-500 text-[10px]">{orderbooker.nearShop.area}</div>
                  )}
                  <div className="text-emerald-500 text-[10px]">{orderbooker.nearShop.distance}m away</div>
                </div>
              )}
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}
