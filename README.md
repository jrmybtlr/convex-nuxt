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
| `useConvexMutation` | browser `ConvexClient.mutation` |
| `useConvexAction` | browser `ConvexClient.action` |
| `useConvex` | browser `ConvexClient` escape hatch |
| `useConvexAuth` | provider-agnostic auth state + `setAuth` |
| `useAuth` / `signIn` / `signOut` | first-party Convex Auth (when `provider: 'convex-auth'`) |

Nitro / server routes (auto-imported in `server/`):

| API | Role |
|---|---|
| `fetchQuery` | one-shot HttpClient query |
| `fetchMutation` | one-shot HttpClient mutation |
| `fetchAction` | one-shot HttpClient action |

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
- When `convex.auth.cookie` is set, `useConvexQuery` falls back to that cookie as `ssrToken`.
- `hasSsrSession` is true while that cookie is present. Use it to keep an SSR-gated shell mounted; do not live-subscribe until `isAuthenticated`.
- Cache keys use `getFunctionName` + `convexToJson`, not `String(query)`.
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
const { error, pending, signIn, signOut, isAuthenticated, hasSsrSession } = useAuth()
// Gate the signed-in shell on cookie OR Convex confirmation so SSR HTML
// does not flash the sign-in form. Keep live queries on `isAuthenticated`.
const showApp = computed(() => isAuthenticated.value || hasSsrSession.value)

await signIn('password', { email, password, flow: 'signIn' })
await signIn('github') // OAuth: redirect, then plugin finishes on ?code=
await signOut()
</script>
```

You still own the Convex backend Auth setup:

- `convex/auth.ts` — `convexAuth({ providers })` exporting `auth`, `signIn`, `signOut`
- `convex/schema.ts` — spread `authTables`
- `convex/http.ts` — `auth.addHttpRoutes(http)` (required for OAuth / magic links)
- `convex/auth.config.ts` — JWT issuer (`CONVEX_SITE_URL`)
- Env: `JWT_PRIVATE_KEY` + `JWKS` (`npx @convex-dev/auth`), plus `SITE_URL` for OAuth

JWT is stored in a readable cookie (`convex_jwt` by default) for SSR, and the
refresh token in `localStorage`. Prefer HttpOnly dual-cookie (Next.js style) is
a follow-up if you need a stronger XSS posture.

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
const { mutate, pending, error } = useConvexMutation(api.tasks.create)
await mutate({ text: 'Ship it' })

const { run } = useConvexAction(api.ai.summarize)
await run({ text: '…' })
```

### Server routes

Pass the H3 `event` so the helper resolves the deployment URL and (when
`convex.auth.cookie` is set) the JWT cookie automatically:

```ts
// server/api/tasks.get.ts
export default defineEventHandler(async (event) => {
  return await fetchQuery(api.tasks.list, {}, { event })
})
```

```ts
// server/api/tasks.post.ts
export default defineEventHandler(async (event) => {
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
    auth: { provider: 'convex-auth', cookie: 'convex_jwt' },
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
- **Server routes** (`/server`) — Nitro `fetchQuery` / `fetchMutation` one-shots.
  - `GET /api/health` — public (`curl localhost:3000/api/health`)
  - `GET` / `POST /api/tasks` — cookie JWT via `{ event }`

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
- [ ] Reactive arg identity edge cases beyond `watch`
- [ ] Pagination
- [ ] Integration tests against a real Convex deployment
- [ ] Nuxt DevTools
- [ ] Release automation
- [ ] HttpOnly dual-cookie SSR (Next.js parity)