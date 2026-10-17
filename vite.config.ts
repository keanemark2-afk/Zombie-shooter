import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
