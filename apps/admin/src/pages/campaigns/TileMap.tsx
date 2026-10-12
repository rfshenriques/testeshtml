import * as React from 'react';
import type { Tile, TileStatus } from '@/lib/types';

const FILL: Record<TileStatus, string> = {
  pending: 'var(--neutral-dot)',
  searching: 'var(--series-2)',
  saturated: 'var(--series-4)',
  done: 'var(--series-1)',
  failed: 'var(--bad-dot)',
};

/** Simple SVG map: tile bboxes normalised into the viewport, no map library. */
export function TileMap({ tiles, width = 640, height = 400 }: { tiles: Tile[]; width?: number; height?: number }) {
  const [hover, setHover] = React.useState<Tile | null>(null);
  const bounds = React.useMemo(() => {
    if (tiles.length === 0) return null;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const t of tiles) {
      minLng = Math.min(minLng, t.bbox[0]);
      minLat = Math.min(minLat, t.bbox[1]);
      maxLng = Math.max(maxLng, t.bbox[2]);
      maxLat = Math.max(maxLat, t.bbox[3]);
    }
    return { minLng, minLat, maxLng, maxLat };
  }, [tiles]);
  if (!bounds) return <div className="text-sm text-muted-fg">No tiles yet.</div>;
  const pad = 8;
  const spanLng = Math.max(1e-9, bounds.maxLng - bounds.minLng);
  const spanLat = Math.max(1e-9, bounds.maxLat - bounds.minLat);
  // Preserve aspect ratio (approximate: scale lng by cos(lat) so tiles don't look squashed).
  const cosLat = Math.cos((((bounds.minLat + bounds.maxLat) / 2) * Math.PI) / 180) || 1;
  const scale = Math.min((width - pad * 2) / (spanLng * cosLat), (height - pad * 2) / spanLat);
  const x = (lng: number) => pad + (lng - bounds.minLng) * cosLat * scale;
  const y = (lat: number) => height - pad - (lat - bounds.minLat) * scale;
  // Draw deeper tiles on top (they are smaller, subdivided children).
  const ordered = [...tiles].sort((a, b) => a.depth - b.depth);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full rounded-lg border bg-muted/40" role="img" aria-label={`Tile map: ${tiles.length} tiles`}>
        {ordered.map((t) => {
          const x1 = x(t.bbox[0]), x2 = x(t.bbox[2]), y1 = y(t.bbox[3]), y2 = y(t.bbox[1]);
          return (
            <rect
              key={t.id}
              x={x1}
              y={y1}
              width={Math.max(1, x2 - x1)}
              height={Math.max(1, y2 - y1)}
              fill={FILL[t.status] ?? 'var(--neutral-dot)'}
              fillOpacity={t.status === 'pending' ? 0.25 : 0.55}
              stroke="var(--card)"
              strokeWidth={1}
              tabIndex={0}
              onMouseEnter={() => setHover(t)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(t)}
              onBlur={() => setHover(null)}
            >
              <title>
                {t.status} · depth {t.depth} · {t.resultCount} results · [{t.bbox.map((n) => n.toFixed(4)).join(', ')}]
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-fg">
        {(Object.keys(FILL) as TileStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: FILL[s], opacity: s === 'pending' ? 0.4 : 0.8 }} aria-hidden /> {s}
          </span>
        ))}
        <span className="ml-auto tabular-nums" aria-live="polite">
          {hover ? `${hover.status} · depth ${hover.depth} · ${hover.resultCount} results` : `${tiles.length} tiles`}
        </span>
      </div>
    </div>
  );
}
