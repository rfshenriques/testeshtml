/**
 * Builds one static mockup site from a SiteBuildInput (spec §9.1, §9.5).
 *
 *   tsx scripts/build-site.ts <input.json> <outDir>
 *
 * Prints `{ "buildHash": "...", "files": n, "outDir": "..." }` on stdout and
 * nothing else (Astro logging is silenced). Exit code 1 on any failure, with
 * the reason on stderr.
 *
 * Isolation: every build runs Astro against a private temporary project root
 * (a copy of src/ plus the config, with node_modules symlinked), so concurrent
 * builds never write into apps/templates and `.astro/` caches are per build.
 * The input reaches the page through SITEWRIGHT_INPUT (a JSON file path).
 *
 * Determinism: no timestamps, no random ids, CSS inlined, no hashed assets and
 * no JS; two builds of the same input yield byte-identical files. The hash is
 * sha256 over the sorted (relativePath, content) pairs of the output.
 */
import { build } from 'astro';
import { SiteBuildInputSchema, type SiteBuildInput } from '@sitewright/shared-types';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface BuildSiteResult { buildHash: string; files: string[] }

/** In-process builds share process.env, so they are serialised; use the CLI (child processes) for parallelism. */
let queue: Promise<unknown> = Promise.resolve();

export async function buildSite(input: SiteBuildInput, outDir: string): Promise<BuildSiteResult> {
  const parsed = SiteBuildInputSchema.parse(input);
  const run = queue.then(() => buildSiteNow(parsed, outDir));
  queue = run.catch(() => undefined);
  return run;
}

async function buildSiteNow(input: SiteBuildInput, outDir: string): Promise<BuildSiteResult> {
  const absOut = path.resolve(outDir);
  if (absOut === PROJECT_ROOT || PROJECT_ROOT.startsWith(absOut + path.sep)) {
    throw new Error(`Refusing to build into ${absOut}: it contains the template project`);
  }
  const work = await mkdtemp(path.join(tmpdir(), 'sitewright-build-'));
  const root = path.join(work, 'root');
  const inputPath = path.join(work, 'input.json');
  const prevInput = process.env.SITEWRIGHT_INPUT;
  const prevOut = process.env.SITEWRIGHT_OUT_DIR;
  try {
    await mkdir(root, { recursive: true });
    await Promise.all([
      cp(path.join(PROJECT_ROOT, 'src'), path.join(root, 'src'), { recursive: true }),
      cp(path.join(PROJECT_ROOT, 'astro.config.mjs'), path.join(root, 'astro.config.mjs')),
      cp(path.join(PROJECT_ROOT, 'package.json'), path.join(root, 'package.json')),
      cp(path.join(PROJECT_ROOT, 'tsconfig.json'), path.join(root, 'tsconfig.json')),
      symlink(path.join(PROJECT_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir'),
      writeFile(inputPath, JSON.stringify(input)),
      mkdir(absOut, { recursive: true }),
    ]);
    process.env.SITEWRIGHT_INPUT = inputPath;
    process.env.SITEWRIGHT_OUT_DIR = absOut;
    await build(
      {
        root,
        outDir: absOut,
        cacheDir: path.join(work, 'cache'),
        logLevel: 'silent',
        vite: { logLevel: 'silent', clearScreen: false },
      },
      { teardownCompiler: false },
    );
  } finally {
    if (prevInput === undefined) delete process.env.SITEWRIGHT_INPUT; else process.env.SITEWRIGHT_INPUT = prevInput;
    if (prevOut === undefined) delete process.env.SITEWRIGHT_OUT_DIR; else process.env.SITEWRIGHT_OUT_DIR = prevOut;
    await rm(work, { recursive: true, force: true });
  }
  const files = await listFiles(absOut);
  const buildHash = await hashFiles(absOut, files);
  return { buildHash, files };
}

/** Relative POSIX paths of every file under dir, sorted. */
export async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  }
  await walk(dir);
  return out.sort();
}

/** sha256 over "<path>\0<content>\0" for each file in sorted order. */
export async function hashFiles(dir: string, files: string[]): Promise<string> {
  const h = createHash('sha256');
  for (const rel of [...files].sort()) {
    h.update(rel);
    h.update('\0');
    h.update(await readFile(path.join(dir, rel)));
    h.update('\0');
  }
  return h.digest('hex');
}

async function main(argv: string[]): Promise<number> {
  const [inputFile, outDir] = argv;
  if (!inputFile || !outDir) {
    process.stderr.write('usage: tsx scripts/build-site.ts <input.json> <outDir>\n');
    return 2;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.resolve(inputFile), 'utf8'));
  } catch (err) {
    process.stderr.write(`build-site: cannot read ${inputFile}: ${(err as Error).message}\n`);
    return 1;
  }
  const parsed = SiteBuildInputSchema.safeParse(raw);
  if (!parsed.success) {
    process.stderr.write(`build-site: invalid SiteBuildInput\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}\n`);
    return 1;
  }
  try {
    const result = await buildSite(parsed.data, outDir);
    process.stdout.write(JSON.stringify({ buildHash: result.buildHash, files: result.files.length, outDir: path.resolve(outDir) }) + '\n');
    return 0;
  } catch (err) {
    process.stderr.write(`build-site: build failed: ${(err as Error).stack ?? String(err)}\n`);
    return 1;
  }
}

async function isMain(): Promise<boolean> {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return (await realpath(entry)) === (await realpath(fileURLToPath(import.meta.url)));
  } catch {
    return false;
  }
}

if (await isMain()) {
  process.exitCode = await main(process.argv.slice(2));
}
