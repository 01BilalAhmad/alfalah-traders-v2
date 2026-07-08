// src/lib/distance.ts
// Haversine distance helper for computing route distance from GPS points.
// Used by route-sessions APIs to compute distance on-the-fly when the stored
// totalDistance is 0 (e.g. legacy auto-ended sessions where the stale-session
// detector didn't compute distance before marking as ended).

export interface GpsPoint {
  lat: number;
  lng: number;
}

/**
 * Haversine distance between two GPS coordinates in meters.
 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Compute total path distance (in meters) by summing haversine distances between
 * consecutive GPS points. Returns 0 if fewer than 2 points are provided.
 *
 * The points array is assumed to be in chronological order (oldest first).
 */
export function computePathDistance(points: GpsPoint[] | null | undefined): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return Math.round(total);
}

/**
 * Decide which distance to use:
 * - If the stored value is non-zero, trust it (already computed at end-route time)
 * - Otherwise compute on-the-fly from the GPS points
 *
 * Returns { distance, computedLive } so the API can flag a backfill opportunity.
 */
export function resolveDistance(
  storedDistance: number | null | undefined,
  points: GpsPoint[] | null | undefined
): { distance: number; computedLive: boolean } {
  const stored = Number(storedDistance) || 0;
  if (stored > 0) {
    return { distance: stored, computedLive: false };
  }
  const computed = computePathDistance(points);
  return { distance: computed, computedLive: computed > 0 };
}
