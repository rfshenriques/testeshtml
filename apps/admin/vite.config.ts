import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // @sitewright/shared-types is a linked workspace package built as CommonJS: pre-bundle it in dev
  // and run it through the CJS transform in the production build so named imports resolve.
  optimizeDeps: { include: ['@sitewright/shared-types'] },
  build: {
    commonjsOptions: { include: [/node_modules/, /packages\/shared-types/] },
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router'], charts: ['recharts'], query: ['@tanstack/react-query', '@tanstack/react-table', '@tanstack/react-virtual'] } } },
  },
  server: {
    port: 5173,
    proxy: { '/admin': 'http://localhost:3000', '/health': 'http://localhost:3000' },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], passWithNoTests: true },
});
