import type { TemplateFamily } from '@sitewright/shared-types';

/** Catalogue consumed by the admin Generator screen (GET /admin/generator/templates). */
export const TEMPLATE_CATALOGUE: ReadonlyArray<{ id: TemplateFamily; verticals: string[]; sections: string[] }> = [
  { id: 'hospitality', verticals: ['restaurant', 'cafe', 'bar', 'bakery', 'hospitality', 'events'], sections: ['Hero', 'Menu highlights', 'About', 'Gallery', 'Hours + map', 'Reservations CTA', 'Reviews', 'Reservation form'] },
  { id: 'appointment', verticals: ['salon', 'spa', 'dental', 'medical', 'veterinary'], sections: ['Hero', 'Services + indicative pricing', 'Team', 'Why us', 'Booking CTA', 'Hours + map', 'Reviews', 'Gallery', 'Booking form'] },
  { id: 'trades', verticals: ['trades', 'automotive'], sections: ['Hero with phone CTA', 'Services grid', 'Service area map', 'Why us', 'Quote CTA', 'Quote form', 'Reviews'] },
  { id: 'professional', verticals: ['legal', 'accounting', 'realestate', 'professional_services', 'education', 'other'], sections: ['Hero', 'Practice areas', 'Credentials', 'Why us', 'Case-style proof', 'Office hours + map', 'Contact form'] },
  { id: 'retail', verticals: ['retail'], sections: ['Hero', 'Categories', 'Featured products', 'Store info', 'Why us', 'Hours + map', 'Reviews', 'Contact form'] },
  { id: 'fitness', verticals: ['gym'], sections: ['Hero', 'Classes', 'Timetable / opening times', 'Membership', 'Trial CTA', 'Gallery', 'About', 'Reviews', 'Trial form'] },
];
