import { describe, expect, it } from 'vitest';
import { bboxCenter, bboxCircumradiusM, bboxFromCircle, bboxFromPolygon, haversineM, pointInPolygon, splitBBox } from './geo';
import type { BBox } from './geo';

describe('haversineM', () => {
  it('matches known distances', () => {
    // London -> Paris ≈ 343.5 km
    const d = haversineM({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 });
    expect(d).toBeGreaterThan(342_000);
    expect(d).toBeLessThan(345_000);
    expect(haversineM({ lat: 10, lng: 10 }, { lat: 10, lng: 10 })).toBe(0);
    // 1 degree of latitude ≈ 111.19 km
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
  });
});

describe('bboxFromCircle / bboxCircumradiusM', () => {
  it('a 1km circle at the equator yields a ~2km square whose half-diagonal is ~1414m', () => {
    const b = bboxFromCircle({ lat: 0, lng: 0 }, 1000);
    const [minLng, minLat, maxLng, maxLat] = b;
    expect(minLng).toBeCloseTo(-maxLng, 10);
    expect(minLat).toBeCloseTo(-maxLat, 10);
    expect(haversineM({ lat: 0, lng: minLng }, { lat: 0, lng: maxLng })).toBeCloseTo(2000, 0);
    expect(haversineM({ lat: minLat, lng: 0 }, { lat: maxLat, lng: 0 })).toBeCloseTo(2000, 0);
    const r = bboxCircumradiusM(b);
    expect(r).toBeGreaterThan(1410);
    expect(r).toBeLessThan(1418);
    expect(bboxCenter(b)).toEqual({ lat: 0, lng: 0 });
  });

  it('widens longitude at high latitude so the box still spans the circle', () => {
    const c = { lat: 60, lng: 10 };
    const b = bboxFromCircle(c, 1000);
    expect(b[2] - b[0]).toBeCloseTo((b[3] - b[1]) / Math.cos((60 * Math.PI) / 180), 6);
    expect(haversineM({ lat: 60, lng: b[0] }, { lat: 60, lng: b[2] })).toBeCloseTo(2000, 0);
    const centre = bboxCenter(b);
    expect(centre.lat).toBeCloseTo(60, 10);
    expect(centre.lng).toBeCloseTo(10, 10);
  });

  it('clamps at the poles and antimeridian', () => {
    const b = bboxFromCircle({ lat: 89.999, lng: 179.999 }, 50_000);
    expect(b[3]).toBe(90);
    expect(b[2]).toBe(180);
  });
});

describe('splitBBox', () => {
  it('produces four equal quadrants that exactly tile the parent', () => {
    const parent: BBox = [10, 20, 14, 26];
    const quads = splitBBox(parent);
    expect(quads).toEqual([
      [10, 20, 12, 23],
      [12, 20, 14, 23],
      [10, 23, 12, 26],
      [12, 23, 14, 26],
    ]);
    const area = (b: BBox) => (b[2] - b[0]) * (b[3] - b[1]);
    expect(quads.reduce((s, q) => s + area(q), 0)).toBeCloseTo(area(parent), 12);
    expect(Math.min(...quads.map((q) => q[0]))).toBe(parent[0]);
    expect(Math.min(...quads.map((q) => q[1]))).toBe(parent[1]);
    expect(Math.max(...quads.map((q) => q[2]))).toBe(parent[2]);
    expect(Math.max(...quads.map((q) => q[3]))).toBe(parent[3]);
    for (const q of quads) expect(bboxCircumradiusM(q)).toBeLessThan(bboxCircumradiusM(parent));
  });
});

describe('bboxFromPolygon / pointInPolygon', () => {
  // Square 0..10 with a hole 4..6
  const polygon: [number, number][][] = [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ];

  it('computes the bbox from the outer ring', () => {
    expect(bboxFromPolygon(polygon)).toEqual([0, 0, 10, 10]);
    expect(() => bboxFromPolygon([])).toThrow();
  });

  it('ray-casts with hole support', () => {
    expect(pointInPolygon({ lat: 2, lng: 2 }, polygon)).toBe(true);
    expect(pointInPolygon({ lat: 5, lng: 5 }, polygon)).toBe(false); // in the hole
    expect(pointInPolygon({ lat: 11, lng: 5 }, polygon)).toBe(false);
    expect(pointInPolygon({ lat: -1, lng: -1 }, polygon)).toBe(false);
    expect(pointInPolygon({ lat: 5, lng: 1 }, [polygon[0]])).toBe(true);
    expect(pointInPolygon({ lat: 5, lng: 5 }, [])).toBe(false);
  });

  it('handles a concave polygon', () => {
    // L-shape
    const l: [number, number][][] = [[[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10], [0, 0]]];
    expect(pointInPolygon({ lat: 2, lng: 8 }, l)).toBe(true);
    expect(pointInPolygon({ lat: 8, lng: 8 }, l)).toBe(false);
    expect(pointInPolygon({ lat: 8, lng: 2 }, l)).toBe(true);
  });
});
