import { bboxCircumradiusM, bboxFromCircle, haversineM, pointInGeometry, pointInPolygon, rootTiles, splitBBox, tileTouchesGeometry, BBox, estimateCampaignCost } from './geometry';

const valletta = { lat: 35.8989, lng: 14.5146 };

describe('territory geometry', () => {
  it('haversine: Valletta to Sliema ≈ 2.4 km', () => {
    const d = haversineM(valletta, { lat: 35.9122, lng: 14.5042 });
    expect(d).toBeGreaterThan(1500);
    expect(d).toBeLessThan(2500);
  });
  it('a circle bbox contains the circle', () => {
    const b = bboxFromCircle(valletta, 1000);
    expect(haversineM(valletta, { lat: b[1], lng: valletta.lng })).toBeCloseTo(1000, -1);
    expect(haversineM(valletta, { lat: valletta.lat, lng: b[0] })).toBeCloseTo(1000, -1);
  });
  it('splitting covers the parent exactly with 4 quadrants', () => {
    const b: BBox = [14.4, 35.8, 14.6, 36.0];
    const q = splitBBox(b);
    expect(q).toHaveLength(4);
    expect(q[0]).toEqual([14.4, 35.8, 14.5, 35.9]);
    expect(q[3]).toEqual([14.5, 35.9, 14.6, 36.0]);
    expect(bboxCircumradiusM(q[0])).toBeLessThan(bboxCircumradiusM(b));
  });
  it('circumradius is half the diagonal', () => {
    const b: BBox = [14.4, 35.8, 14.6, 36.0];
    expect(bboxCircumradiusM(b)).toBeCloseTo(haversineM({ lat: 35.8, lng: 14.4 }, { lat: 36.0, lng: 14.6 }) / 2, 3);
  });
  it('point in polygon with a hole', () => {
    const coords: [number, number][][] = [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
    ];
    expect(pointInPolygon({ lat: 2, lng: 2 }, coords)).toBe(true);
    expect(pointInPolygon({ lat: 5, lng: 5 }, coords)).toBe(false);
    expect(pointInPolygon({ lat: 11, lng: 5 }, coords)).toBe(false);
  });
  it('root tiles per geometry kind', () => {
    expect(rootTiles({ kind: 'bbox', bbox: [1, 2, 3, 4] })).toEqual([[1, 2, 3, 4]]);
    expect(rootTiles({ kind: 'cities', cities: [{ name: 'A', lat: 35.9, lng: 14.5, radiusM: 2000 }, { name: 'B', lat: 36, lng: 14.3, radiusM: 1000 }] })).toHaveLength(2);
    expect(rootTiles({ kind: 'polygon', geojson: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] } })).toEqual([[0, 0, 2, 2]]);
  });
  it('tiles outside a polygon are skipped; points outside a circle are dropped', () => {
    const tri = { kind: 'polygon' as const, geojson: { type: 'Polygon' as const, coordinates: [[[0, 0], [10, 0], [0, 10], [0, 0]]] as [number, number][][] } };
    expect(tileTouchesGeometry([1, 1, 2, 2], tri)).toBe(true);
    expect(tileTouchesGeometry([8, 8, 9, 9], tri)).toBe(false);
    const circle = { kind: 'circle' as const, center: valletta, radiusM: 500 };
    expect(pointInGeometry(valletta, circle)).toBe(true);
    expect(pointInGeometry({ lat: 35.95, lng: 14.5 }, circle)).toBe(false);
    expect(tileTouchesGeometry([14.51, 35.89, 14.52, 35.90], circle)).toBe(true);
    expect(tileTouchesGeometry([14.7, 36.1, 14.8, 36.2], circle)).toBe(false);
  });
  it('estimates cost in the right order of magnitude', () => {
    const e = estimateCampaignCost({ kind: 'circle', center: valletta, radiusM: 3000 }, 5);
    expect(e.km2).toBeGreaterThan(20);
    expect(e.usd).toBeGreaterThan(1);
    expect(e.usd).toBeLessThan(100);
  });
});
