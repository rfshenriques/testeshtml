/**
 * Inline SVG placeholder images (spec §0.7 option 3: clearly marked grey blocks).
 * Served as data: URIs so an <img> element can carry alt text, dimensions and
 * data-placeholder="true" exactly like a real photo, with no network request.
 */
export function placeholderSvg(width: number, height: number, label = 'Indicative image'): string {
  const fontSize = Math.max(14, Math.round(Math.min(width, height) / 14));
  const safe = label.replace(/[<>&"']/g, '');
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}' role='img' aria-label='${safe}'>` +
    `<rect width='100%' height='100%' fill='#e4e4e4'/>` +
    `<path d='M0 ${height}L${width} 0' stroke='#cfcfcf' stroke-width='2'/>` +
    `<path d='M0 0L${width} ${height}' stroke='#cfcfcf' stroke-width='2'/>` +
    `<rect x='${Math.round(width * 0.2)}' y='${Math.round(height / 2 - fontSize)}' width='${Math.round(width * 0.6)}' height='${fontSize * 2}' fill='#e4e4e4'/>` +
    `<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='system-ui, Arial, sans-serif' font-size='${fontSize}' fill='#444'>${safe}</text>` +
    `</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/%2C/g, ',');
}
