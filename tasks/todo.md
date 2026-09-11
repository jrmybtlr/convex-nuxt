# Developer experience improvements

## Plan

- [x] Shared `[use-convex]` error helper + consistent actionable messages
- [x] Tighten `useConvexQueries` TypeScript inference; export missing public types
- [x] Migrate lint/format/test to **Vite+** (Oxlint + Oxfmt + Vitest 4)
- [x] Add `typecheck:playground` and run check/typecheck in CI
- [x] Improve DevTools iframe (config + auth/query tips + client bridge)
- [x] Extend module-setup tests (AuthRefreshing, upload imports, DevTools)
- [x] Add `CONTRIBUTING.md` + README contributor pointer
- [x] Verify: `vp check`, `vp test`, typecheck, playground typecheck, build

## Review

- **Toolchain:** Replaced ESLint/standalone Vitest with `vite-plus` (`vp lint` / `vp fmt` / `vp check` / `vp test`). Nuxt module build/dev stay on `nuxt-module-build` / `nuxi`.
- **Vitest 4:** Convex `import.meta.glob` extglob `!(*.*.*)` no longer expands — switched playground `test.setup.ts` to an include/exclude list.
- **DX:** Shared error helpers, richer DevTools iframe + `window.__CONVEX_NUXT__` auth bridge, public type exports, contributor docs.
