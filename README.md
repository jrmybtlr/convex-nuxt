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
import { api } from '~/convex/_generated/api'

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
    server: true,
    lazy: false,
    live: true,
    token, // optional SSR JWT for this request only
  },
)
```

- Args accept `FunctionArgs`, `'skip'`, or a `MaybeRefOrGetter` of either.
- Use `'skip'` until auth args are ready so private queries do not fire anonymously.
- Pass `token` for authenticated SSR. Never put JWTs in `runtimeConfig.public`.
- When `convex.auth.cookie` is set, `useConvexQuery` falls back to that cookie as `ssrToken`.
- Cache keys use `getFunctionName` + `convexToJson`, not `String(query)`.

### `useConvexAuth`

Provider-agnostic helper — same contract as React `ConvexProviderWithAuth`.
Wire it once with a token fetcher; read the derived flags anywhere.

```ts
// plugins/convex-auth.client.ts
useConvexAuth({
  fetchToken: ({ forceRefreshToken }) => myAuth.getToken({ forceRefreshToken }),
  isLoading: myAuth.isLoading,
  isAuthenticated: myAuth.hasSession,
})

// anywhere
const { isLoading, isAuthenticated, isRefreshing } = useConvexAuth()

const { data } = await useConvexQuery(
  api.tasks.list,
  computed(() => (isAuthenticated.value ? {} : 'skip')),
)
```

Optional SSR cookie (opt-in):

```ts
// nuxt.config.ts
convex: {
  url: process.env.NUXT_PUBLIC_CONVEX_URL,
  auth: { cookie: 'convex_jwt' },
}
```

Write the JWT into that cookie after sign-in so the next SSR request can
authenticate HttpClient queries. The module does **not** depend on a specific
auth provider — Clerk, Auth0, Convex Auth, etc. all work if they expose a
`fetchToken`.

### Mutations and actions

```ts
const { mutate, pending, error } = useConvexMutation(api.tasks.create)
await mutate({ text: 'Ship it' })

const { run } = useConvexAction(api.ai.summarize)
await run({ text: '…' })
```

### Server routes

```ts
// server/api/tasks.get.ts
export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'convex-token')
  return await fetchQuery(api.tasks.list, {}, { token })
})
```

Each `fetch*` helper constructs a **fresh** `ConvexHttpClient` (HttpClient is stateful).

## Playground demo

The `playground/` app is a password-auth todo list against a real Convex backend.

```bash
pnpm install

# Terminal 1 — Convex backend (creates .env.local with NUXT_PUBLIC_CONVEX_URL)
pnpm run dev:backend
# first time: npx @convex-dev/auth   # JWT_PRIVATE_KEY + JWKS

# Terminal 2 — Nuxt
pnpm run dev
```

Then open the app, sign up with email/password, and exercise list / create /
toggle / delete. Refresh to verify SSR uses the `convex_jwt` cookie.

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
- [x] Real Convex playground backend + task tests
- [ ] Reactive arg identity edge cases beyond `watch`
- [ ] Pagination
- [ ] Integration tests against a real Convex deployment
- [ ] Nuxt DevTools
- [ ] Release automation
