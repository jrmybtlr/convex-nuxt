import { defineConfig } from 'vite-plus'

/**
 * Vite+ unified config (Oxlint, Oxfmt, Vitest).
 *
 * Nuxt module build/dev stay on `nuxt-module-build` / `nuxi`
 * (`pnpm build`, `pnpm dev`). Use `vp` / package scripts for lint, format,
 * check, and test.
 */
export default defineConfig({
  lint: {
    ignorePatterns: [
      'dist/**',
      'playground/.nuxt/**',
      'playground/.output/**',
      'playground/convex/_generated/**',
      'test/fixtures/**/.nuxt/**',
      'test/fixtures/**/.output/**',
      '**/*.d.ts',
    ],
    options: {
      // Keep module typecheck on vue-tsc / nuxi; Oxlint stays syntax+rules.
      typeAware: false,
      typeCheck: false,
    },
  },
  fmt: {
    ignorePatterns: [
      'dist/**',
      'playground/.nuxt/**',
      'playground/.output/**',
      'playground/convex/_generated/**',
      'pnpm-lock.yaml',
      '**/*.d.ts',
    ],
    singleQuote: true,
    semi: false,
  },
  check: {
    fmt: true,
    lint: true,
  },
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
          environment: 'node',
        },
      },
    ],
  },
  staged: {
    '*': 'vp check --fix',
  },
})
