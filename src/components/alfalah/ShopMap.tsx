'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Badge } from '@/components/ui/badge';

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

interface ShopMapMarker {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  balance: number;
  status: string;
  orderbookerName: string;
  routeDay: string;
  lat: number;
  lng: number;
}

interface ShopMapProps {
  markers: ShopMapMarker[];
}

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Component to reset map view when markers change
function MapViewController({ markers }: { markers: ShopMapMarker[] }) {
  const map = useMap();
  const prevLengthRef = useRef(0);

  useEffect(() => {
    if (markers.length > 0 && markers.length !== prevLengthRef.current) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      }
    }
    prevLengthRef.current = markers.length;
  }, [markers, map]);

  return null;
}

export default function ShopMap({ markers }: ShopMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Default center on Pakistan
  const defaultCenter: [number, number] = [30.3753, 69.3451];
  const defaultZoom = 5;

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
        <MapViewController markers={markers} />

        {markers.map((marker) => (
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
                  OB: {marker.orderbookerName} &bull; Route: {marker.routeDay.charAt(0).toUpperCase() + marker.routeDay.slice(1)}
                </p>
                <p className={`text-xs font-bold ${marker.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  Balance: {formatCurrency(marker.balance)}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Placeholder overlay when no markers */}
      {markers.length === 0 && (
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
