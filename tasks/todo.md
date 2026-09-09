# Ranked improvements for @convex/nuxt

## Plan

- [x] P0.1 Auth hydration: `showAuthedUi`, matching SSR/client first paint, fix TasksDemo
- [x] P0.2 Reactive `useAsyncData` keys (+ skip key stability tests)
- [x] P0.3 Watch `ssrToken` / `options.token` on HttpClient path
- [x] P1 Nitro `requireConvexAuth` / `getConvexToken`
- [x] P1 Auth layout helpers (`Authenticated` / `Unauthenticated` / `AuthLoading`)
- [x] P1 Optimistic mutations
- [x] P1 Playground demos (action, live:false, auth gate)
- [x] P2 `useConvexPaginatedQuery`
- [x] P2 HttpOnly dual-cookie auth via Nitro
- [x] P2 Connection state + DevTools + real-deployment e2e scaffold

## Review: gap analysis vs `convex/react` (+ Next / Auth)

Compared `@convex/nuxt` (v0.0.2) against:

- `convex/react` (core hooks / providers / auth gates)
- `convex/nextjs` (SSR / server one-shots)
- `@convex-dev/auth/react` (+ Next Auth helpers)
- Adjacent ecosystem: `convex/react-clerk`, `convex/react-auth0`, `@convex-dev/react-query`, `@convex-dev/presence`

### Verdict

Core app path is strong: queries (SSR + live), mutations/actions, auth (generic + Convex Auth), pagination, Nitro `fetch*`, connection state. The largest real gaps are **multi-query**, **paginated-query live semantics**, **paginated optimistic helpers**, and a few **auth UI / token** APIs. Naming and return shapes intentionally differ for Vue/Nuxt — that is adaptation, not missing capability, except where noted below.

### Parity matrix

| Concern | `convex/react` (+ Next/Auth) | `@convex/nuxt` | Gap? |
|---|---|---|---|
| Client provide/inject | `ConvexProvider` / `useConvex` | plugins + `useConvex` | Parity |
| Reactive query | `useQuery` | `useConvexQuery` | Parity (shape differs) |
| `"skip"` | yes | yes | Parity |
| Mutation | `useMutation` | `useConvexMutation` | Parity (API shape differs) |
| Optimistic updates | `.withOptimisticUpdate` | `options.optimisticUpdate` | Parity (no chainable API) |
| Action | `useAction` | `useConvexAction` | Parity |
| Paginated query | `usePaginatedQuery` | `useConvexPaginatedQuery` | **Partial** — see below |
| Multi-query | `useQueries` | — | **Missing** |
| Auth state | `useConvexAuth` | `useConvexAuth` + `showAuthedUi` | Parity+ |
| Auth gates | `Authenticated` / `Unauthenticated` / `AuthLoading` / **`AuthRefreshing`** | first three + `useConvexGate` | **Missing `AuthRefreshing`** |
| Generic auth wire-up | `ConvexProviderWithAuth` | `useConvexAuth({ fetchToken })` | Parity |
| Convex Auth | `useAuthActions` / `ConvexAuthProvider` | `signIn` / `signOut` / `useAuth` | Parity |
| Auth JWT for HTTP | `useAuthToken` | — (cookie / session route) | **Missing hook** |
| SSR preload | `preloadQuery` + `usePreloadedQuery` | built into `useConvexQuery` | Parity (integrated) |
| Server one-shots | `fetchQuery` / `Mutation` / `Action` | Nitro same names | Parity |
| Connection state | `useConvexConnectionState` | same | Parity |
| Query prewarm | `client.prewarmQuery` | — | **Missing** |
| Paginated optimistic helpers | `insertAtTop` / `insertAtBottomIfLoaded` / `insertAtPosition` / `optimisticallyUpdateValueInPaginatedQuery` | — | **Missing** |
| Experimental object-form query | `useQuery_experimental` | Nuxt already returns `{ data, error, status, pending }` | N/A / covered |
| Clerk / Auth0 drop-ins | `ConvexProviderWithClerk` / `WithAuth0` | BYO docs only | Soft gap (docs OK) |
| Route middleware matchers | `@convex-dev/auth/nextjs` middleware helpers | `requireConvexAuth` only | Soft gap |
| Suspense / TanStack | `@convex-dev/react-query` | — | Out of scope unless desired |
| Presence | `@convex-dev/presence` | — | Ecosystem, not core |

### Behavioral gaps (not just missing exports)

1. **Pagination live coverage (high)**  
   React keeps **all loaded pages** under reactive watches (journal-aware). Nuxt SSR + live-subscribes **only the first page**; `loadMore` uses one-shot `client.query` and drops the tail when the first page updates. Later pages go stale and first-page updates wipe `extraPages`. Closest to React would be multi-page subscriptions (or the experimental client pagination path).

2. **`useQueries` (high)**  
   No dynamic map of subscriptions. Apps that subscribe to N ids / conditional query sets must call `useConvexQuery` in a fixed loop or drop to `useConvex().onUpdate` manually.

3. **Error model (medium / intentional)**  
   React `useQuery` throws → Error Boundary. Nuxt returns `error` / `status` (Vue-idiomatic). Document clearly; optional throw mode would match React experimental `throwOnError`.

4. **Mutation ergonomics (low)**  
   React: `const m = useMutation(api.x); m.withOptimisticUpdate(fn)`. Nuxt binds optimistic update at composable creation. Fine for most apps; no per-call attach / stable callable identity story like `ReactMutation`.

5. **Client options surface (low)**  
   React exposes `ConvexReactClientOptions` (`expectAuth`, `unsavedChangesWarning`, custom WS, logger, etc.). Module constructs `ConvexClient` internally — little/no passthrough config.

6. **`AuthRefreshing` (low–medium)**  
   `isRefreshing` exists on auth state but there is no gate component. Easy add.

7. **`useAuthToken` (medium for HTTP actions)**  
   React Auth exposes current JWT for calling HTTP actions from the browser. Nuxt has cookie/session machinery but no `useAuthToken()` composable.

8. **Prewarm / prefetch (low)**  
   No `prewarmQuery` wrapper for route-level prefetch before mount.

### Nuxt advantages (ahead of plain `convex/react`)

- SSR snapshot + payload + live overlay **inside** the query composable (React needs `convex/nextjs` + `usePreloadedQuery`)
- `showAuthedUi` / `hasSsrSession` (SSR-safe shells without flash)
- `live: false`, `lazy`, `refresh`, reactive `MaybeRefOrGetter` args
- HttpOnly dual-cookie auth via Nitro (Next Auth parity, not in core React)
- Nuxt DevTools tab + `window.__CONVEX_NUXT__`
- `useConvexGate` convenience flags

### Ranked follow-ups (if closing gaps)

| Priority | Item | Why |
|---|---|---|
| P0 | Fix paginated live semantics (subscribe all pages / avoid wiping tail naively) | Correctness vs React |
| P1 | `useConvexQueries` (≈ `useQueries`) | Common dynamic list pattern |
| P1 | Export paginated optimistic helpers (re-export from `convex/react` or thin Vue wrappers) | Mutation UX for lists |
| P2 | `AuthRefreshing` component | Auth UI parity |
| P2 | `useAuthToken` | HTTP action / fetch from client |
| P2 | Module option passthrough for `ConvexClient` options | Advanced / RN-adjacent / expectAuth |
| P3 | `prewarmQuery` helper | Perf nicety |
| P3 | Optional Nuxt middleware helpers (route matchers) | Next Auth middleware parity |
| — | Clerk/Auth0 first-party wrappers | Nice-to-have; BYO already works |
| — | TanStack / Suspense bridge | Separate package territory |

### Previously noted (still open)

- [ ] Reactive arg identity edge cases beyond `watch`
- [ ] Broader Playwright suite against a real Convex deployment

### Verify (prior session)

- `pnpm test` — 66 passed, 3 skipped
- `pnpm typecheck` / `pnpm build` — green
- Live browser against playground not run in that session
