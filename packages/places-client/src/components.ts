import type { PlaceDetails } from './types';

type Component = PlaceDetails['addressComponents'][number];

function firstWithType(components: Component[], type: string): Component | undefined {
  return components.find((c) => c.types.includes(type));
}

/** ISO 3166-1 alpha-2 from the `country` component's shortText, upper-cased. */
export function countryCodeFromComponents(components: PlaceDetails['addressComponents']): string | null {
  const c = firstWithType(components ?? [], 'country');
  if (!c) return null;
  const code = (c.shortText || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

const CITY_TYPE_PREFERENCE = [
  'locality',
  'postal_town',
  'administrative_area_level_3',
  'sublocality_level_1',
  'sublocality',
  'administrative_area_level_2',
];

/** Best-effort city name: locality, then postal_town (GB), then progressively coarser areas. */
export function cityFromComponents(components: PlaceDetails['addressComponents']): string | null {
  for (const type of CITY_TYPE_PREFERENCE) {
    const c = firstWithType(components ?? [], type);
    if (c && c.longText.trim()) return c.longText.trim();
  }
  return null;
}
