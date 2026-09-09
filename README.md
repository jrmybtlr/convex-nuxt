# @convex/nuxt

First-class Convex integration for Nuxt 4.

Install two packages:

```bash
pnpm add @convex/nuxt convex
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@convex/nuxt'],
  convex: {
    url: process.env.NUXT_PUBLIC_CONVEX_URL,
    // Optional: forwarded to `new ConvexClient(url, client)`
    // client: { unsavedChangesWarning: false },
  },
})
```

```vue
<script setup lang="ts">
// Nuxt 4 with `app/`: `~~` is the project root (where `convex/` lives).
import { api } from '~~/convex/_generated/api'

const { data, pending, error } = await useConvexQuery(api.tasks.list, {})
</script>
```

That is the default path: SSR snapshot, Nuxt payload hydration, then a live subscription.

## SSR architecture

```text
                 useConvexQuery()
                       │
              ┌────────┴────────┐
              │                 │
           Nuxt SSR          Browser
              │                 │
     new ConvexHttpClient   ConvexClient
              │                 │
        useAsyncData       onUpdate
              │                 │
        Nuxt payload ──► live ?? payload
```

Both server and client call `useAsyncData` with the same key so hydration
reuses the payload (no duplicate HTTP). The browser then overlays
`ConvexClient.onUpdate`, same idea as Next.js `usePreloadedQuery`.

## API

Auto-imported:

| API | Role |
|---|---|
| `useConvexQuery` | SSR HttpClient + payload + live overlay |
| `useConvexQueries` | dynamic multi-query map (React `useQueries`) |
| `useConvexPaginatedQuery` | SSR first page + live multi-page + `loadMore` |
| `useConvexMutation` | browser `ConvexClient.mutation` (+ optional `optimisticUpdate`) |
| `useConvexAction` | browser `ConvexClient.action` |
| `useConvex` | browser `ConvexClient` escape hatch |
| `prewarmQuery` | warm a query subscription before mount |
| `useConvexAuth` | provider-agnostic auth state + `setAuth` + `showAuthedUi` |
| `useAuthToken` | current JWT for HTTP calls |
| `useConvexGate` | `{ showAuthedUi, showLoading, showSignedOut, showRefreshing }` |
| `useConvexConnectionState` | reactive WebSocket `ConnectionState` |
| `useAuth` / `signIn` / `signOut` | first-party Convex Auth (when `provider: 'convex-auth'`) |
| `Authenticated` / `Unauthenticated` / `AuthLoading` / `AuthRefreshing` | auth layout components |
| `insertAtTop` / `insertAtBottomIfLoaded` / `insertAtPosition` / `optimisticallyUpdateValueInPaginatedQuery` | paginated optimistic helpers |
| `requireConvexAuthMiddleware` | Nuxt route middleware redirect helper |

Nitro / server routes (auto-imported in `server/`):

| API | Role |
|---|---|
| `fetchQuery` | one-shot HttpClient query |
| `fetchMutation` | one-shot HttpClient mutation |
| `fetchAction` | one-shot HttpClient action |
| `getConvexToken` | read JWT cookie from `event` |
| `requireConvexAuth` | throw H3 401 when cookie missing |

### `useConvexQuery`

```ts
const { data, pending, error, refresh } = await useConvexQuery(
  api.tasks.list,
  {}, // or a ref / getter / 'skip'
  {
    key: 'tasks:list', // optional — defaults to function name + args JSON
    server: true,      // optional — defaults to convex.server (true)
    lazy: false,
    live: true,
    token, // optional SSR JWT for this request only
  },
)
```

- Args accept `FunctionArgs`, `'skip'`, or a `MaybeRefOrGetter` of either.
- Use `'skip'` until auth args are ready so private queries do not fire anonymously.
  `'skip'` keeps the same payload key as empty args so SSR HTML survives the auth gate.
- Pass `token` for authenticated SSR. Never put JWTs in `runtimeConfig.public`.
- When `convex.auth.cookie` / HttpOnly auth is set, `useConvexQuery` falls back to that cookie as `ssrToken`.
- `hasSsrSession` / `showAuthedUi` keep an SSR-gated shell mounted; do not live-subscribe until `isAuthenticated`.
- Cache keys use `getFunctionName` + `convexToJson`, not `String(query)`, and stay reactive to args.
- Set `convex.server: false` in `nuxt.config` to disable SSR snapshots globally.

### Auth

Two paths:

#### Convex Auth (recommended)

Opt in with `provider: 'convex-auth'`. The module registers a client plugin that
hydrates tokens, finishes OAuth `?code=` callbacks, and wires `setAuth`. Forms
only call `signIn` / `signOut` — no app plugin required.

```ts
// nuxt.config.ts
convex: {
  url: process.env.NUXT_PUBLIC_CONVEX_URL,
  auth: {
    provider: 'convex-auth',
    // cookie defaults to 'convex_jwt' when provider is set
  },
}
```

```vue
<script setup lang="ts">
const { error, pending, signIn, signOut, isAuthenticated, hasSsrSession, showAuthedUi } = useAuth()
// Prefer showAuthedUi (or <Authenticated>) so SSR HTML does not flash the
// sign-in form. Keep live queries on `isAuthenticated`.
</script>

<template>
  <AuthLoading>Resolving…</AuthLoading>
  <Authenticated>
    <!-- signed-in shell -->
  </Authenticated>
  <Unauthenticated>
    <!-- sign-in form -->
  </Unauthenticated>
</template>
```

```ts
await signIn('password', { email, password, flow: 'signIn' })
await signIn('github') // OAuth: redirect, then plugin finishes on ?code=
await signOut()
```

You still own the Convex backend Auth setup:

- `convex/auth.ts` — `convexAuth({ providers })` exporting `auth`, `signIn`, `signOut`
- `convex/schema.ts` — spread `authTables`
- `convex/http.ts` — `auth.addHttpRoutes(http)` (required for OAuth / magic links)
- `convex/auth.config.ts` — JWT issuer (`CONVEX_SITE_URL`)
- Env: `JWT_PRIVATE_KEY` + `JWKS` (`npx @convex-dev/auth`), plus `SITE_URL` for OAuth

By default the JWT is a readable cookie (`convex_jwt`) and the refresh token
lives in `localStorage`. For Next.js-style HttpOnly dual cookies:

```ts
convex: {
  url: process.env.NUXT_PUBLIC_CONVEX_URL,
  auth: {
    provider: 'convex-auth',
    httpOnly: true, // JWT + refresh via Nitro `/api/convex/auth/session`
  },
}
```

A readable `convex_auth_present` marker drives `hasSsrSession` / `showAuthedUi`
on the client; tokens themselves are HttpOnly.

#### Bring your own (Clerk, Auth0, custom)

Omit `provider` and wire `useConvexAuth` yourself — same contract as React
`ConvexProviderWithAuth`:

```ts
// plugins/my-auth.client.ts
useConvexAuth({
  fetchToken: ({ forceRefreshToken }) => auth.getToken({ forceRefreshToken }),
  isLoading: auth.isLoading,
  isAuthenticated: auth.hasSession,
})
```

```ts
const { isLoading, isAuthenticated, isRefreshing, hasSsrSession } = useConvexAuth()

const { data } = await useConvexQuery(
  api.tasks.list,
  computed(() => (isAuthenticated.value ? {} : 'skip')),
)
```

Optional SSR cookie (BYO must write the JWT after sign-in):

```ts
convex: {
  url: process.env.NUXT_PUBLIC_CONVEX_URL,
  auth: { cookie: 'convex_jwt' },
}
```

### Mutations and actions

```ts
const { mutate, pending, error } = useConvexMutation(api.tasks.create, {
  optimisticUpdate: (localStore, args) => {
    const existing = localStore.getQuery(api.tasks.list, {}) ?? []
    localStore.setQuery(api.tasks.list, {}, [
      { _id: 'tmp', text: args.text, completed: false },
      ...existing,
    ])
  },
})
await mutate({ text: 'Ship it' })

const { run } = useConvexAction(api.ai.summarize)
await run({ text: '…' })
```

### Pagination

```ts
const { results, status, isLoading, loadMore } = await useConvexPaginatedQuery(
  api.tasks.listPaginated,
  {},
  { initialNumItems: 20 },
)
```

The first page is SSR'd via HttpClient. On the browser,
`onPaginatedUpdate_experimental` keeps **every loaded page** live (React
`usePaginatedQuery` parity). `loadMore` asks the paginated client for the next
page.

### Multi-query

```ts
const results = useConvexQueries(() => ({
  inbox: { query: api.messages.list, args: { channel: 'inbox' } },
  later: selectedId.value
    ? { query: api.messages.get, args: { id: selectedId.value } }
    : 'skip',
}))
```

### Paginated optimistic updates

```ts
const { mutate } = useConvexMutation(api.tasks.create, {
  optimisticUpdate: (localStore, args) => {
    insertAtTop({
      paginatedQuery: api.tasks.listPaginated,
      localQueryStore: localStore,
      item: { _id: 'tmp', text: args.text, completed: false },
    })
  },
})
```

### Server routes

Pass the H3 `event` so the helper resolves the deployment URL and (when
`convex.auth.cookie` / HttpOnly auth is set) the JWT cookie automatically:

```ts
// server/api/tasks.get.ts
export default defineEventHandler(async (event) => {
  requireConvexAuth(event)
  return await fetchQuery(api.tasks.list, {}, { event })
})
```

```ts
// server/api/tasks.post.ts
export default defineEventHandler(async (event) => {
  requireConvexAuth(event)
  const { text } = await readBody(event)
  return await fetchMutation(api.tasks.create, { text }, { event })
})
```

`fetchAction` uses the same options shape. Each helper constructs a **fresh**
`ConvexHttpClient` (HttpClient is stateful). Override with `{ token }` when you
already have a JWT.

## Playground demo

The `playground/` app is a **normal Nuxt consumer** of `@convex/nuxt`
(workspace-linked), not a special harness:

```ts
// playground/nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@convex/nuxt'],
  convex: {
    url: process.env.NUXT_PUBLIC_CONVEX_URL,
    auth: { provider: 'convex-auth', httpOnly: true },
  },
})
```

Auth UI calls module `signIn` / `signOut` — no app auth plugin.

```bash
pnpm install

# Terminal 1 — Convex backend (creates .env.local with NUXT_PUBLIC_CONVEX_URL)
pnpm run dev:backend
# first time: npx @convex-dev/auth   # JWT_PRIVATE_KEY + JWKS

# Terminal 2 — Nuxt
pnpm run dev
```

- **Live** (`/`) — SSR snapshot + live WebSocket overlay (sign up, CRUD todos, refresh).
- **Server routes** (`/server`) — Nitro `fetchQuery` / `fetchMutation` / `fetchAction` + `requireConvexAuth`.
  - `GET /api/health` — public (`curl localhost:3000/api/health`)
  - `GET` / `POST /api/tasks` — cookie JWT via `{ event }`
  - `POST /api/shout` — public `fetchAction` demo
- **Extras** (`/extras`) — `live: false`, pagination, action, connection state.

## Roadmap

- [x] Nuxt 4 module + runtime config
- [x] Per-request HttpClient on SSR
- [x] Browser-only ConvexClient
- [x] `useConvexQuery` with useAsyncData on both sides
- [x] Live overlay (`live ?? payload`)
- [x] Stable query keys (`getFunctionName` + `convexToJson`)
- [x] `'skip'` + optional SSR `token`
- [x] `useConvexMutation` / `useConvexAction` / `useConvex`
- [x] Nitro `fetchQuery` / `fetchMutation` / `fetchAction`
- [x] Full auth helper (`useConvexAuth` + token refresh)
- [x] First-party Convex Auth (`provider: 'convex-auth'` + `useAuth` / `signIn` / `signOut`)
- [x] Real Convex playground backend + task tests
- [x] Event-aware Nitro helpers + playground server examples
- [x] Release automation
- [x] Reactive `useAsyncData` keys + `ssrToken` watch
- [x] `showAuthedUi` / auth layout components
- [x] Nitro `requireConvexAuth` / `getConvexToken`
- [x] Optimistic mutations
- [x] `useConvexPaginatedQuery`
- [x] HttpOnly dual-cookie SSR (Next.js parity)
- [x] Connection state + Nuxt DevTools tab
- [x] Optional live-deployment e2e scaffold (`test/e2e`)
- [x] Live multi-page pagination (`onPaginatedUpdate_experimental`)
- [x] `useConvexQueries` (React `useQueries`)
- [x] Paginated optimistic helpers
- [x] `AuthRefreshing` + `useAuthToken` + `prewarmQuery`
- [x] `ConvexClient` options passthrough + auth middleware helper
- [ ] Reactive arg identity edge cases beyond `watch`
- [ ] Broader Playwright suite against a real Convex deployment

## Releasing

Releases run automatically via GitHub Actions when commits land on `main` (workflow: `.github/workflows/release.yml`).

Version bumps come from [conventional commits](https://www.conventionalcommits.org/):

| Commit type | Release |
|---|---|
| `fix: ...` | patch |
| `feat: ...` | minor |
| `feat!: ...` or `BREAKING CHANGE:` footer | major |
| `chore:`, `docs:`, `ci:`, etc. | no release |

When there is a releasable commit, semantic-release:

1. Publishes `@convex/nuxt` to npm
2. Creates a `vX.Y.Z` git tag
3. Opens a GitHub Release with generated notes

`package.json` version in the repo is not committed back; the published tarball still carries the real version.

### First release

With no existing git tags, the first release is **1.0.0**. To stay on 0.x, tag the current commit before the first run:

```bash
git tag v0.0.2
git push origin v0.0.2
```

### npm trusted publishing (one-time)

Prefer [npm trusted publishers](https://docs.npmjs.com/trusted-publishers) (OIDC) so you do not need a long-lived `NPM_TOKEN`:

1. On npm (package or `@convex` org), add a GitHub Actions trusted publisher
2. Repository: `jrmybtlr/convex-nuxt`
3. Workflow filename: `release.yml`
4. Environment: leave empty

If trusted publishing is not available yet, add a repository secret `NPM_TOKEN` (automation token with publish rights to `@convex`) and pass it into the release step:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```
