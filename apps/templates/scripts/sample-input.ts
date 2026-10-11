/**
 * Writes a fixture SiteBuildInput as JSON, for the admin Generator sample pages.
 *
 *   tsx scripts/sample-input.ts <family> [colourScheme=a] [typography=a] [outFile]
 *
 * With no outFile the JSON is printed on stdout.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { COLOUR_SCHEMES, TEMPLATE_FAMILIES, TYPOGRAPHY_PAIRINGS, type TemplateFamily } from '@sitewright/shared-types';
import { sampleInput, type ColourScheme, type Typography } from '../src/fixtures/sample-input';

const [family, scheme = 'a', typography = 'a', outFile] = process.argv.slice(2);
if (!family || !(TEMPLATE_FAMILIES as readonly string[]).includes(family)) {
  process.stderr.write(`usage: tsx scripts/sample-input.ts <${TEMPLATE_FAMILIES.join('|')}> [a|b|c] [a|b] [outFile]\n`);
  process.exit(2);
}
if (!(COLOUR_SCHEMES as readonly string[]).includes(scheme) || !(TYPOGRAPHY_PAIRINGS as readonly string[]).includes(typography)) {
  process.stderr.write(`sample-input: colourScheme must be one of ${COLOUR_SCHEMES.join('|')} and typography one of ${TYPOGRAPHY_PAIRINGS.join('|')}\n`);
  process.exit(2);
}
const json = JSON.stringify(sampleInput(family as TemplateFamily, scheme as ColourScheme, typography as Typography), null, 2);
if (outFile) {
  await writeFile(path.resolve(outFile), json);
} else {
  process.stdout.write(json + '\n');
}
