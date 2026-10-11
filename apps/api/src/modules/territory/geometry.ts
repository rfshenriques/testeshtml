import type { CampaignGeometry } from '@sitewright/shared-types';

/** [minLng, minLat, maxLng, maxLat] */
export type BBox = [number, number, number, number];
export interface LatLng { lat: number; lng: number }

const EARTH_R = 6_371_008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bboxCenter(b: BBox): LatLng {
  return { lat: (b[1] + b[3]) / 2, lng: (b[0] + b[2]) / 2 };
}

/** Radius of the circle circumscribing the bbox (half the diagonal), in metres (spec §5.2: accept overlap, dedupe by place_id). */
export function bboxCircumradiusM(b: BBox): number {
  return haversineM({ lat: b[1], lng: b[0] }, { lat: b[3], lng: b[2] }) / 2;
}

export function splitBBox(b: BBox): [BBox, BBox, BBox, BBox] {
  const midLng = (b[0] + b[2]) / 2;
  const midLat = (b[1] + b[3]) / 2;
  return [
    [b[0], b[1], midLng, midLat],
    [midLng, b[1], b[2], midLat],
    [b[0], midLat, midLng, b[3]],
    [midLng, midLat, b[2], b[3]],
  ];
}

export function bboxFromCircle(c: LatLng, radiusM: number): BBox {
  const dLat = (radiusM / EARTH_R) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos(toRad(c.lat)), 1e-6);
  return [c.lng - dLng, c.lat - dLat, c.lng + dLng, c.lat + dLat];
}

export function bboxFromPolygon(coords: [number, number][][]): BBox {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const ring of coords) for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** Ray casting over a GeoJSON Polygon (outer ring + holes). */
export function pointInPolygon(p: LatLng, coords: [number, number][][]): boolean {
  const inRing = (ring: [number, number][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersect = yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi + 0) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };
  if (!coords.length || !inRing(coords[0])) return false;
  for (let h = 1; h < coords.length; h++) if (inRing(coords[h])) return false;
  return true;
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function bboxArea(b: BBox): number {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

/** Root tiles for a campaign geometry. City lists produce one root per city; everything else one root. */
export function rootTiles(g: CampaignGeometry): BBox[] {
  switch (g.kind) {
    case 'bbox':
      return [g.bbox];
    case 'circle':
      return [bboxFromCircle(g.center, g.radiusM)];
    case 'polygon':
      return [bboxFromPolygon(g.geojson.coordinates)];
    case 'cities':
      return g.cities.map((c) => bboxFromCircle({ lat: c.lat, lng: c.lng }, c.radiusM));
  }
}

/** Does a tile (bbox) overlap the campaign geometry at all? Used to skip quadrants outside a polygon/circle. */
export function tileTouchesGeometry(tile: BBox, g: CampaignGeometry): boolean {
  switch (g.kind) {
    case 'bbox':
      return bboxIntersects(tile, g.bbox);
    case 'circle': {
      const c = closestPointOnBBox(g.center, tile);
      return haversineM(c, g.center) <= g.radiusM;
    }
    case 'cities':
      return g.cities.some((c) => haversineM(closestPointOnBBox({ lat: c.lat, lng: c.lng }, tile), { lat: c.lat, lng: c.lng }) <= c.radiusM);
    case 'polygon': {
      if (!bboxIntersects(tile, bboxFromPolygon(g.geojson.coordinates))) return false;
      const corners: LatLng[] = [
        { lat: tile[1], lng: tile[0] }, { lat: tile[1], lng: tile[2] }, { lat: tile[3], lng: tile[0] }, { lat: tile[3], lng: tile[2] }, bboxCenter(tile),
      ];
      if (corners.some((c) => pointInPolygon(c, g.geojson.coordinates))) return true;
      // polygon vertex inside the tile
      return g.geojson.coordinates[0].some(([lng, lat]) => lng >= tile[0] && lng <= tile[2] && lat >= tile[1] && lat <= tile[3]);
    }
  }
}

/** Is a point inside the campaign geometry? Used to drop results that fall outside a polygon/circle (search circles overlap). */
export function pointInGeometry(p: LatLng, g: CampaignGeometry): boolean {
  switch (g.kind) {
    case 'bbox':
      return p.lng >= g.bbox[0] && p.lng <= g.bbox[2] && p.lat >= g.bbox[1] && p.lat <= g.bbox[3];
    case 'circle':
      return haversineM(p, g.center) <= g.radiusM;
    case 'cities':
      return g.cities.some((c) => haversineM(p, { lat: c.lat, lng: c.lng }) <= c.radiusM);
    case 'polygon':
      return pointInPolygon(p, g.geojson.coordinates);
  }
}

function closestPointOnBBox(p: LatLng, b: BBox): LatLng {
  return { lat: Math.max(b[1], Math.min(p.lat, b[3])), lng: Math.max(b[0], Math.min(p.lng, b[2])) };
}

/** Rough cost estimate (spec §0.4): search requests ≈ tiles × types; details for ~20% that qualify. */
export function estimateCampaignCost(g: CampaignGeometry, typeCount: number, pricing = { searchUsd: 0.032, detailsUsd: 0.02 }) {
  const roots = rootTiles(g);
  // Assume saturation to ~1 km tiles over the covered area: tiles ≈ area / 1km².
  let km2 = 0;
  for (const b of roots) {
    const w = haversineM({ lat: b[1], lng: b[0] }, { lat: b[1], lng: b[2] }) / 1000;
    const h = haversineM({ lat: b[1], lng: b[0] }, { lat: b[3], lng: b[0] }) / 1000;
    km2 += w * h;
  }
  const tiles = Math.max(1, Math.ceil(km2));
  const searchRequests = tiles * Math.max(1, typeCount) * 1.33; // + parents
  const expectedBusinesses = searchRequests * 12;
  const detailsRequests = expectedBusinesses * 0.2;
  return { km2: Math.round(km2), searchRequests: Math.round(searchRequests), detailsRequests: Math.round(detailsRequests), usd: Math.round((searchRequests * pricing.searchUsd + detailsRequests * pricing.detailsUsd) * 100) / 100 };
}
