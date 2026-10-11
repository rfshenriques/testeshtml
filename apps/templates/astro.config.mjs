import { defineConfig } from 'astro/config';

// Output directory and the build input are provided by scripts/build-site.ts via
// env (SITEWRIGHT_OUT_DIR, SITEWRIGHT_INPUT) and inline config.
export default defineConfig({
  output: 'static',
  outDir: process.env.SITEWRIGHT_OUT_DIR || './dist',
  build: { format: 'directory', inlineStylesheets: 'always', assets: '_astro' },
  compressHTML: true,
  vite: {
    // The workspace package is CommonJS and lives outside node_modules (pnpm
    // symlink), so Vite must leave it to Node at render time instead of bundling it.
    ssr: { external: ['@sitewright/shared-types'] },
    build: { sourcemap: false },
  },
});
