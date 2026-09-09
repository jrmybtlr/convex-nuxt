# Auth helper + local Convex todo demo

## Plan

- [x] Provider-agnostic `useConvexAuth` + token refresh (`onRefreshChange`)
- [x] Optional SSR JWT cookie (`convex.auth.cookie` → `ctx.ssrToken`)
- [x] Real Convex playground backend (Password auth + per-user tasks)
- [x] Playground auth adapter + todo UI
- [x] Unit tests + docs

## Local verify

```bash
pnpm install
pnpm test
pnpm run build

# Terminal 1 — creates .env.local with NUXT_PUBLIC_CONVEX_URL
pnpm run dev:backend
# first time in playground/:
#   npx @convex-dev/auth

# Terminal 2
pnpm run dev
```

Sign up → add/toggle/delete todos → refresh (SSR via cookie) → sign out.

## Review

### Done

- `useConvexAuth` mirrors React ConvexAuthState (`isLoading` / `isAuthenticated` / `isRefreshing`)
- Browser wires `BaseConvexClient.setAuth` with refresh callback
- Optional `convex.auth.cookie` for SSR HttpClient auth
- Playground: `@convex-dev/auth` Password + per-user `tasks` API
- Playground UI: AuthForm + gated TasksDemo (skip when signed out)
- Tests: auth state machine + `convex-test` for tasks (21 passing)
- README updated; roadmap checks auth + playground backend

### Notes

- Convex Dashboard API was unreachable from the agent environment, so
  `playground/convex/_generated` stubs are committed for offline typecheck/tests.
  Run `npx convex dev` locally to link a deployment and regenerate them.
- Pagination / DevTools / live CI integration tests remain deferred.
