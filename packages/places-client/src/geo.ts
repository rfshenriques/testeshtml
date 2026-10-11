/** Pure geometry helpers for quadtree tiling (spec §5.2). Coordinates are WGS84 degrees. */

export type BBox = [number, number, number, number]; // minLng, minLat, maxLng, maxLat
export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bboxCenter(b: BBox): LatLng {
  const [minLng, minLat, maxLng, maxLat] = b;
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

/** Half the diagonal (SW→NE) distance in metres: the circumscribing radius of the bbox. */
export function bboxCircumradiusM(b: BBox): number {
  const [minLng, minLat, maxLng, maxLat] = b;
  return haversineM({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng }) / 2;
}

/** Four equal quadrants: [SW, SE, NW, NE]. Their union is exactly the parent. */
export function splitBBox(b: BBox): [BBox, BBox, BBox, BBox] {
  const [minLng, minLat, maxLng, maxLat] = b;
  const midLng = (minLng + maxLng) / 2;
  const midLat = (minLat + maxLat) / 2;
  return [
    [minLng, minLat, midLng, midLat],
    [midLng, minLat, maxLng, midLat],
    [minLng, midLat, midLng, maxLat],
    [midLng, midLat, maxLng, maxLat],
  ];
}

const clampLat = (v: number): number => Math.max(-90, Math.min(90, v));
const clampLng = (v: number): number => Math.max(-180, Math.min(180, v));

/** Axis-aligned bbox containing a circle, converting metres to degrees at the circle's latitude. */
export function bboxFromCircle(c: LatLng, radiusM: number): BBox {
  const metresPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const dLat = radiusM / metresPerDegLat;
  const cosLat = Math.cos(toRad(c.lat));
  const dLng = cosLat > 1e-12 ? radiusM / (metresPerDegLat * cosLat) : 180;
  return [clampLng(c.lng - dLng), clampLat(c.lat - dLat), clampLng(c.lng + dLng), clampLat(c.lat + dLat)];
}

/** Bbox of a GeoJSON Polygon's coordinates ([lng, lat] pairs; outer ring first, holes after). */
export function bboxFromPolygon(coords: [number, number][][]): BBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const ring of coords) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLng)) throw new Error('bboxFromPolygon: polygon has no coordinates');
  return [minLng, minLat, maxLng, maxLat];
}

function pointInRing(p: LatLng, ring: [number, number][]): boolean {
  // Ray casting along +x (lng). Points exactly on an edge are treated as inside.
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Point in GeoJSON Polygon: inside the outer ring and outside every hole. */
export function pointInPolygon(p: LatLng, coords: [number, number][][]): boolean {
  if (coords.length === 0 || coords[0].length < 3) return false;
  if (!pointInRing(p, coords[0])) return false;
  for (let i = 1; i < coords.length; i++) {
    if (pointInRing(p, coords[i])) return false;
  }
  return true;
}
