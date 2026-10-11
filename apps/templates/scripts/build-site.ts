/**
 * Builds one static mockup site from a SiteBuildInput (spec §9.1, §9.5).
 *
 *   tsx scripts/build-site.ts <input.json> <outDir>
 *
 * Prints `{ "buildHash": "...", "files": n, "outDir": "..." }` on stdout and
 * nothing else. Exit code 1 on any failure, with the reason on stderr.
 *
 * Isolation. Each build gets a private temporary directory under the OS tmpdir
 * holding a copy of src/ plus the Astro config (node_modules symlinked), and
 * `astro build` is spawned with that directory as cwd, project root and output
 * location. Nothing under apps/templates is written to, so builds can run in
 * parallel (the API runs two at a time). Astro relocates its build through
 * `<cwd>/.astro/` whenever outDir is outside cwd, which is why cwd, root and
 * outDir must all live in the temp directory; the finished site is then moved
 * to the requested outDir. The input reaches the page through SITEWRIGHT_INPUT
 * (a JSON file path) read in src/pages/index.astro.
 *
 * Determinism. No timestamps, no random ids, CSS inlined, no hashed assets and
 * no JS; two builds of the same input yield byte-identical files. buildHash is
 * sha256 over the sorted (relativePath, content) pairs of the output.
 */
import { SiteBuildInputSchema, type SiteBuildInput } from '@sitewright/shared-types';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASTRO_CLI = path.join(PROJECT_ROOT, 'node_modules', 'astro', 'astro.js');

export interface BuildSiteResult { buildHash: string; files: string[] }

/**
 * Validates `input`, renders the matching template family and writes the static
 * site to `outDir` (created if missing, emptied first). Safe to call concurrently.
 */
export async function buildSite(input: SiteBuildInput, outDir: string): Promise<BuildSiteResult> {
  const parsed = SiteBuildInputSchema.parse(input);
  const absOut = path.resolve(outDir);
  if (absOut === PROJECT_ROOT || PROJECT_ROOT.startsWith(absOut + path.sep) || absOut === path.parse(absOut).root) {
    throw new Error(`Refusing to build into ${absOut}: it contains the template project`);
  }
  const work = await mkdtemp(path.join(tmpdir(), 'sitewright-build-'));
  const root = path.join(work, 'root');
  const tmpOut = path.join(work, 'out');
  const inputPath = path.join(work, 'input.json');
  try {
    await mkdir(root, { recursive: true });
    await Promise.all([
      cp(path.join(PROJECT_ROOT, 'src'), path.join(root, 'src'), { recursive: true }),
      cp(path.join(PROJECT_ROOT, 'astro.config.mjs'), path.join(root, 'astro.config.mjs')),
      cp(path.join(PROJECT_ROOT, 'package.json'), path.join(root, 'package.json')),
      cp(path.join(PROJECT_ROOT, 'tsconfig.json'), path.join(root, 'tsconfig.json')),
      symlink(path.join(PROJECT_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir'),
      // The rendered SSR bundle under work/out imports the externalised workspace package at build time.
      symlink(path.join(PROJECT_ROOT, 'node_modules'), path.join(work, 'node_modules'), 'dir'),
      writeFile(inputPath, JSON.stringify(parsed)),
    ]);
    await runAstroBuild({ cwd: work, root, outDir: tmpOut, inputPath });
    await rm(absOut, { recursive: true, force: true });
    await mkdir(path.dirname(absOut), { recursive: true });
    try {
      await rename(tmpOut, absOut);
    } catch {
      await cp(tmpOut, absOut, { recursive: true }); // tmpdir on another filesystem
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  const files = await listFiles(absOut);
  const buildHash = await hashFiles(absOut, files);
  return { buildHash, files };
}

function runAstroBuild(opts: { cwd: string; root: string; outDir: string; inputPath: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [ASTRO_CLI, 'build', '--root', opts.root, '--silent'],
      {
        cwd: opts.cwd,
        env: {
          ...process.env,
          SITEWRIGHT_INPUT: opts.inputPath,
          SITEWRIGHT_OUT_DIR: opts.outDir,
          ASTRO_TELEMETRY_DISABLED: '1',
          FORCE_COLOR: '0',
          NODE_ENV: 'production',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`astro build exited with code ${code}\n${output.trim()}`));
    });
  });
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
    process.stderr.write(`build-site: build failed: ${(err as Error).message}\n`);
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
