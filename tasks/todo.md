# Close gaps vs convex/react

## Plan

- [x] P0 Fix `useConvexPaginatedQuery` live semantics via `onPaginatedUpdate_experimental`
- [x] P1 Add `useConvexQueries`
- [x] P1 Add paginated optimistic helpers (without importing `convex/react`)
- [x] P2 Add `AuthRefreshing` + `useConvexGate.showRefreshing`
- [x] P2 Add `useAuthToken`
- [x] P2 Pass `ConvexClientOptions` through module config / plugin
- [x] P3 Add `prewarmQuery`
- [x] P3 Add `requireConvexAuthMiddleware`
- [x] Tests + README + verify `pnpm test` / typecheck / build

## Review

### Done

- **Pagination:** Client uses `ConvexClient.onPaginatedUpdate_experimental` so all loaded pages stay live; SSR still hydrates the first page. Public status strings unchanged (`LoadingFirstPage` / `CanLoadMore` / `LoadingMore` / `Exhausted`).
- **Multi-query:** `useConvexQueries` mirrors React `useQueries` with `'skip'` and reactive maps.
- **Optimistic helpers:** `insertAtTop`, `insertAtBottomIfLoaded`, `insertAtPosition`, `optimisticallyUpdateValueInPaginatedQuery` ported against `OptimisticLocalStore` (no React import).
- **Auth:** `AuthRefreshing` component, `useAuthToken`, middleware helper `requireConvexAuthMiddleware`.
- **Client options:** `convex.client` → `new ConvexClient(url, options)`.
- **Prewarm:** `prewarmQuery(query, args)` starts an `onUpdate` subscription.

### Verify

- `pnpm test` — 73 passed, 3 skipped
- `pnpm typecheck` / `pnpm build` — green
