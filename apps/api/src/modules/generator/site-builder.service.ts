import { Inject, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { SiteBuildInput } from '@sitewright/shared-types';
import { ENV, Env } from '../../shared/config/config.module';

export interface BuildResult { buildHash: string; outDir: string; files: string[]; ms: number }
export interface SiteBuilder { build(input: SiteBuildInput, outDir: string): Promise<BuildResult> }

/**
 * Runs the Astro template build (apps/templates/scripts/build-site.ts) in an isolated output
 * directory as a child process (spec §9.5: isolated worker dir, deterministic output, hashed).
 */
@Injectable()
export class AstroSiteBuilder implements SiteBuilder {
  private readonly log = new Logger(AstroSiteBuilder.name);
  readonly templatesDir: string;
  constructor(@Inject(ENV) private readonly env: Env) {
    this.templatesDir = env.TEMPLATES_DIR || path.resolve(__dirname, '../../../../templates');
  }

  async build(input: SiteBuildInput, outDir: string): Promise<BuildResult> {
    const t0 = Date.now();
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });
    const inputPath = path.join(outDir, '..', `${path.basename(outDir)}.input.json`);
    await fs.writeFile(inputPath, JSON.stringify(input));
    const stdout = await run('pnpm', ['exec', 'tsx', 'scripts/build-site.ts', inputPath, outDir], this.templatesDir, 120_000);
    await fs.rm(inputPath, { force: true });
    const line = stdout.trim().split('\n').reverse().find((l) => l.trim().startsWith('{'));
    let buildHash = line ? (JSON.parse(line).buildHash as string) : '';
    const files = await listFiles(outDir);
    if (!buildHash) buildHash = await hashDir(outDir, files);
    const ms = Date.now() - t0;
    this.log.log({ outDir, files: files.length, ms, buildHash: buildHash.slice(0, 12) }, 'site built');
    return { buildHash, outDir, files, ms };
  }
}

export async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string) => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(path.relative(dir, p));
    }
  };
  await walk(dir);
  return out.sort();
}

export async function hashDir(dir: string, files: string[]): Promise<string> {
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update(await fs.readFile(path.join(dir, f)));
  }
  return h.digest('hex');
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const t = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`build timed out after ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { clearTimeout(t); reject(e); });
    child.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) resolve(out);
      else reject(new Error(`build exited ${code}: ${err.slice(-2000)}`));
    });
  });
}
