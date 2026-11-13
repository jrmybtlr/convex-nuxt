/// <reference types="vite/client" />

/**
 * Modules for `convex-test`.
 *
 * Prefer an explicit include/exclude list: Vite/Vitest 4 no longer expands the
 * `!(*.*.*)` extglob that older Convex docs recommended (`b []` under Oxc/Vite).
 * `auth.ts` / `users.ts` / `convex.config.ts` need the mounted Convex Auth
 * components, which these domain tests don't register.
 */
export const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.test.js',
  '!./test.setup.ts',
  '!./auth.ts',
  '!./users.ts',
  '!./convex.config.ts',
])
