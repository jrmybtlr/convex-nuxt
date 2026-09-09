# Ranked improvements for @convex/nuxt

## Plan

- [x] P0.1 Auth hydration: `showAuthedUi`, matching SSR/client first paint, fix TasksDemo
- [x] P0.2 Reactive `useAsyncData` keys (+ skip key stability tests)
- [x] P0.3 Watch `ssrToken` / `options.token` on HttpClient path
- [x] P1 Nitro `requireConvexAuth` / `getConvexToken`
- [x] P1 Auth layout helpers (`Authenticated` / `Unauthenticated` / `AuthLoading`)
- [x] P1 Optimistic updates on `useConvexMutation`
- [x] P1 Playground demos (action, live:false, auth gate)
- [x] P2 `useConvexPaginatedQuery`
- [x] P2 HttpOnly dual-cookie auth via Nitro
- [x] P2 Connection state + DevTools + real-deployment e2e scaffold

## Review

### Done

- **Hydration:** `showAuthedUi` on `useConvexAuth` / `useAuth`; server still stamps `isAuthenticated` for SSR queryArgs; client does not (avoids hydrate mismatch). Playground uses `<Authenticated>` / `showAuthedUi`; live queries still gate on `isAuthenticated`.
- **Keys / token watch:** `useConvexQuery` passes a computed key into `useAsyncData` and watches `ssrToken` / `options.token`.
- **Nitro:** `requireConvexAuth` / `getConvexToken`; playground tasks routes use them; `/api/shout` demos `fetchAction`.
- **DX:** `Authenticated` / `Unauthenticated` / `AuthLoading`, `useConvexGate`, `optimisticUpdate` on mutations, `useConvexPaginatedQuery`, `useConvexConnectionState`, DevTools iframe tab + `window.__CONVEX_NUXT__`.
- **HttpOnly:** `auth.httpOnly: true` → Nitro `/api/convex/auth/session`, HttpOnly JWT/refresh + readable presence cookie. Playground opts in.
- **E2E scaffold:** `test/e2e/` skipped unless `E2E_CONVEX=1`.

### Verify

- `pnpm test` — 66 passed, 3 skipped
- `pnpm typecheck` / `pnpm build` — green
- Live browser against playground not run in this session (needs `pnpm run dev` + `dev:backend`)
