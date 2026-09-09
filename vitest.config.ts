import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'test/**/*.test.ts',
            'playground/convex/**/*.test.ts',
            'playground/e2e/**/*.test.ts',
          ],
          exclude: ['test/**/*.nuxt.test.ts'],
        },
      },
      {
        test: {
          name: 'nuxt',
          include: ['test/**/*.nuxt.test.ts'],
          // Environment is provided by @nuxt/test-utils/e2e setup()
          environment: 'node',
        },
      },
    ],
  },
})
