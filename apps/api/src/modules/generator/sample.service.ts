import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { AstroSiteBuilder } from './site-builder.service';

/** Builds a template sample with fixture data (admin Generator screen). Cached per template/scheme/typography. */
@Injectable()
export class SampleService {
  private cache = new Map<string, string>();
  constructor(private readonly builder: AstroSiteBuilder) {}

  async sampleHtml(template: string, colourScheme: string, typography: string): Promise<string> {
    const key = `${template}/${colourScheme}/${typography}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const outDir = path.resolve('.work/samples', template, `${colourScheme}-${typography}`);
    await fs.mkdir(outDir, { recursive: true });
    const inputPath = path.join(outDir, 'input.json');
    await new Promise<void>((resolve, reject) => {
      const child = spawn('pnpm', ['exec', 'tsx', 'scripts/sample-input.ts', template, colourScheme, typography, inputPath], { cwd: this.builder.templatesDir, stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      child.stderr.on('data', (d) => (err += d));
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`sample-input failed: ${err.slice(-500)}`))));
      child.on('error', reject);
    });
    const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
    await this.builder.build(input, path.join(outDir, 'site'));
    const html = await fs.readFile(path.join(outDir, 'site', 'index.html'), 'utf8');
    this.cache.set(key, html);
    return html;
  }
}
