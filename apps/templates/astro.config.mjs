import { defineConfig } from 'astro/config';

// Output directory and the build input are provided by scripts/build-site.ts via env.
export default defineConfig({
  output: 'static',
  outDir: process.env.SITEWRIGHT_OUT_DIR || './dist',
  build: { format: 'directory', inlineStylesheets: 'always' },
  compressHTML: true,
});
