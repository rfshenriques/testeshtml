import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { SiteBuildInput } from '@sitewright/shared-types';
import { BuildResult, hashDir, listFiles } from '../src/modules/generator/site-builder.service';

/** Writes a minimal but invariant-complete static site without running Astro. */
export class FakeSiteBuilder {
  templatesDir = '/nonexistent';
  builds: SiteBuildInput[] = [];
  omit: { noindex?: boolean; banner?: boolean; placeholder?: boolean } = {};
  async build(input: SiteBuildInput, outDir: string): Promise<BuildResult> {
    this.builds.push(input);
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(path.join(outDir, 'about'), { recursive: true });
    const img = this.omit.placeholder ? '<img src="x.png" alt="x">' : '<img src="x.png" alt="x" data-placeholder="true">';
    const html = `<!doctype html><html><head>${this.omit.noindex ? '' : '<meta name="robots" content="noindex,nofollow">'}<title>${input.copy.meta.title}</title><link rel="stylesheet" href="/style.css"></head><body>${this.omit.banner ? '' : `<div class="banner">Unofficial concept mockup prepared by ${input.mockup.agencyName}. Not affiliated with or endorsed by ${input.mockup.businessName}.</div>`}<h1>${input.copy.hero.headline}</h1>${img}<form method="post" action="${input.mockup.formEndpoint}"><input name="email"><button>Send</button></form><a href="${input.mockup.takedownUrl}">Remove this mockup</a></body></html>`;
    await fs.writeFile(path.join(outDir, 'index.html'), html);
    await fs.writeFile(path.join(outDir, 'about', 'index.html'), html.replace('<h1>', '<h1>About: '));
    await fs.writeFile(path.join(outDir, 'style.css'), `body{color:#111}/*${input.template}-${input.colourScheme}-${input.typography}*/`);
    const files = await listFiles(outDir);
    return { buildHash: await hashDir(outDir, files), outDir, files, ms: 5 };
  }
}
