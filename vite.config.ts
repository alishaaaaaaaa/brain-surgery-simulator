import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5173, open: false },
  // Three.js alone is ~600 kB; one bundle is fine for a local simulator.
  build: { chunkSizeWarningLimit: 1200 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
