import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    proxy: { '/admin': 'http://localhost:3000', '/health': 'http://localhost:3000' },
  },
  // @ts-expect-error vitest config
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], passWithNoTests: true },
});
