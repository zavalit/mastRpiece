import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/integration/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Recommended for integration tests to avoid port conflicts
      },
    },
  },
});
