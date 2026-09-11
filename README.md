# use-convex

First-class [Convex](https://convex.dev) integration for [Nuxt 4](https://nuxt.com).

SSR snapshots hydrate through the Nuxt payload, then the browser overlays a live WebSocket subscription.

## Install

[`use-convex` on npm](https://www.npmjs.com/package/use-convex)

```bash
npm i use-convex convex
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['use-convex'],
  convex: {
    url: process.env.NUXT_PUBLIC_CONVEX_URL,
  },
})
```

```vue
<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { data, pending, error } = await useConvexQuery(api.tasks.list, {})
</script>
```

With Nuxt 4's `app/` directory, `~~` is the project root (where `convex/` lives).

## How it works

```text
                 useConvexQuery()
                       │
              ┌────────┴────────┐
              │                 │
           Nuxt SSR          Browser
              │                 │
     ConvexHttpClient      ConvexClient
              │                 │
        useAsyncData        onUpdate
              │                 │
        Nuxt payload ──► live ?? payload
```

Server and client share the same `useAsyncData` key so hydration reuses the payload. The browser then overlays `ConvexClient.onUpdate`.

Set `convex.server: false` to skip SSR snapshots globally, or pass `{ server: false }` on a single query.

## Queries

```ts
const { data, pending, error, refresh } = await useConvexQuery(
  api.tasks.list,
  {}, // args, a ref / getter, or 'skip'
)
```

| Option          | Default                  | Purpose                                    |
| --------------- | ------------------------ | ------------------------------------------ |
| `key`           | function name + args     | Nuxt payload / cache key                   |
| `server`        | `convex.server` (`true`) | SSR HttpClient snapshot                    |
| `lazy`          | `false`                  | Non-blocking on client navigation          |
| `live`          | `true`                   | Subscribe after hydration                  |
| `authenticated` | `false`                  | Wait for Convex auth before live subscribe |
| `token`         | cookie / none            | Per-request JWT for SSR                    |

Args accept the query's `FunctionArgs`, `'skip'`, or a `MaybeRefOrGetter` of either.

- **`'skip'`** — gate on missing ids, feature flags, etc. Keeps the same payload key as empty args so SSR HTML survives.
- **`authenticated: true`** — skip live subscribe until Convex confirms auth. SSR still snapshots when the JWT cookie is present. Prefer this over wrapping args yourself.
- **`token`** — authenticated SSR for this call only. Never put JWTs in `runtimeConfig.public`. When `convex.auth.cookie` / HttpOnly auth is set, queries fall back to that cookie.

Warm a subscription before a screen mounts:

```ts
prewarmQuery(api.tasks.list, {})
```

### Several queries

```ts
const results = useConvexQueries(() => ({
  inbox: { query: api.messages.list, args: { channel: 'inbox' } },
  later: selectedId.value ? { query: api.messages.get, args: { id: selectedId.value } } : 'skip',
}))
```

### Pagination

```ts
const { results, status, isLoading, loadMore } = await useConvexPaginatedQuery(
  api.tasks.listPaginated,
  {},
  { initialNumItems: 20 },
)
```

The first page is SSR'd. On the browser, every loaded page stays live. `loadMore` fetches the next page.

## Mutations and actions

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

For paginated lists:

```ts
insertAtTop({
  paginatedQuery: api.tasks.listPaginated,
  localQueryStore: localStore,
  item: { _id: 'tmp', text: args.text, completed: false },
})
```

Also available: `insertAtBottomIfLoaded`, `insertAtPosition`, `optimisticallyUpdateValueInPaginatedQuery`.

`useConvex()` returns the browser `ConvexClient` when you need an escape hatch. `useConvexConnectionState()` is a reactive WebSocket `ConnectionState`.

## File uploads

Convex file storage is a three-step client flow: generate a short-lived upload URL, `POST` the file bytes, then save the returned `storageId` in a mutation. `useConvexFileUpload` wraps that for Nuxt (browser-only, with `pending` / `error` / `progress`).

```ts
const { upload, pending, error, progress } = useConvexFileUpload({
  generateUploadUrl: api.files.generateUploadUrl,
  saveFile: api.files.save, // ({ storageId, name, contentType, size, ... }) => Id<"files">
})

await upload(file)
// optional extra save args: await upload(file, { caption: '…' })
```

Your Convex mutations must enforce auth — never expose an unauthenticated `generateUploadUrl`. Prefer storing `storageId` (and resolving URLs with `ctx.storage.getUrl`) over persisting raw public URLs. See the playground `files` module and the `/files` page for a full list/upload/delete example.

### Cloudflare R2 (`@convex-dev/r2`)

For larger objects or R2-backed apps, use `useConvexR2Upload` — the Vue counterpart of `@convex-dev/r2/react`'s `useUploadFile`. It does not depend on the R2 package at runtime; pass the `clientApi()` exports from your Convex app:

```ts
// convex/r2.ts
import { R2 } from '@convex-dev/r2'
import { components } from './_generated/api'

const r2 = new R2(components.r2)
export const { generateUploadUrl, syncMetadata } = r2.clientApi({
  checkUpload: async (ctx) => {
    /* auth */
  },
})
```

```ts
const { upload, pending, error, progress } = useConvexR2Upload(api.r2)
const key = await upload(file)
```

That runs `generateUploadUrl` → `PUT` to the signed URL → `syncMetadata({ key })`, with XHR progress. Use built-in `useConvexFileUpload` for Convex storage; use this helper when you adopt the R2 component.

## Auth

### Convex Auth

Opt in with `provider: 'convex-auth'`. The module hydrates tokens, finishes OAuth `?code=` callbacks, and wires `setAuth`. Forms only call `signIn` / `signOut`.

```ts
convex: {
  url: process.env.NUXT_PUBLIC_CONVEX_URL,
  auth: {
    provider: 'convex-auth',
    // cookie defaults to 'convex_jwt'
  },
}
```

```vue
<script setup lang="ts">
const { signIn, signOut } = useAuth()
</script>

<template>
  <AuthLoading>Resolving…</AuthLoading>
  <AuthRefreshing>Refreshing session…</AuthRefreshing>
  <Authenticated>
    <!-- signed-in shell -->
  </Authenticated>
  <Unauthenticated>
    <!-- sign-in form -->
  </Unauthenticated>
</template>
```

Prefer `<Authenticated>` (or `showAuthedUi`) so SSR HTML does not flash the sign-in form. Gate private queries with `{ authenticated: true }`. `<AuthRefreshing>` shows only while an authenticated session is refreshing a rejected token (same as React).

```ts
await signIn('password', { email, password, flow: 'signIn' })
await signIn('github') // OAuth redirect; the plugin finishes on ?code=
await signOut()
```

You still own the Convex backend:

- `convex/auth.ts` — `convexAuth({ providers })` exporting `auth`, `signIn`, `signOut`
- `convex/schema.ts` — spread `authTables`
- `convex/http.ts` — `auth.addHttpRoutes(http)` (required for OAuth / magic links)
- `convex/auth.config.ts` — JWT issuer (`CONVEX_SITE_URL`)
- Env: `JWT_PRIVATE_KEY` + `JWKS` (`npx @convex-dev/auth`), plus `SITE_URL` for OAuth

By default the JWT is a readable cookie (`convex_jwt`) and the refresh token lives in `localStorage`. For production Convex Auth apps, prefer HttpOnly dual cookies:

```ts
auth: {
  provider: 'convex-auth',
  httpOnly: true, // JWT + refresh via Nitro `/api/convex/auth/session`
}
```

A readable `convex_auth_present` marker drives `hasSsrSession` / `showAuthedUi` (UI shell only — **not** authorization). Always gate private live queries with `{ authenticated: true }` (or equivalent). Tokens are HttpOnly cookies; the session API returns the JWT only via same-origin `POST { getToken: true }` for `ConvexClient.setAuth`. That mitigates cookie theft, **not** XSS (any XSS that can call your origin can still obtain a token once the client needs it in memory).

### SSR query budget

Defaults are `convex.server: true` and per-query `live: true` (HttpClient snapshot **and** WebSocket). On list-heavy pages, skip SSR or live selectively:

```ts
await useConvexQuery(api.tasks.list, {}, { server: false }) // client-only
await useConvexQuery(api.stats.get, {}, { live: false }) // SSR / one-shot only
```

Or set `convex: { server: false }` globally.

Protect a route:

```ts
// middleware/auth.ts
export default defineNuxtRouteMiddleware(() => {
  return requireConvexAuthMiddleware({ redirectTo: '/login' })
})
```

`useAuthToken()` returns the current JWT for authenticated HTTP calls. `useConvexGate()` exposes `{ showAuthedUi, showLoading, showSignedOut, showRefreshing }` if you prefer flags over layout components (`Authenticated` / `Unauthenticated` / `AuthLoading` / `AuthRefreshing`).

### Bring your own (Clerk, Auth0, custom)

Omit `provider` and wire `useConvexAuth` yourself:

```ts
// plugins/my-auth.client.ts
useConvexAuth({
  fetchToken: ({ forceRefreshToken }) => auth.getToken({ forceRefreshToken }),
  isLoading: auth.isLoading,
  isAuthenticated: auth.hasSession,
})
```

```ts
const { data } = await useConvexQuery(api.tasks.list, {}, { authenticated: true })
```

Optional SSR cookie (you must write the JWT after sign-in):

```ts
auth: {
  cookie: 'convex_jwt'
}
```

## Server routes

Nitro helpers are auto-imported in `server/`. Pass the H3 `event` so they resolve the deployment URL and, when a cookie is configured, the JWT:

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

`fetchAction` uses the same options. Each helper builds a fresh `ConvexHttpClient`. Override with `{ token }` when you already have a JWT. `getConvexToken(event)` reads the cookie without throwing.

## Config

```ts
convex: {
  url: process.env.NUXT_PUBLIC_CONVEX_URL,
  server: true, // SSR snapshots; override per query with { server }
  client: { unsavedChangesWarning: false }, // forwarded to new ConvexClient()
  auth: {
    provider: 'convex-auth',
    cookie: 'convex_jwt',
    httpOnly: false,
    presentCookie: 'convex_auth_present',
  },
}
```

`url` also reads `NUXT_PUBLIC_CONVEX_URL` via `runtimeConfig.public.convex.url`, so you can change the deployment without rebuilding.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Lint/format/test use **Vite+** (`vp`) — Oxlint, Oxfmt, and Vitest — while Nuxt module build/dev stay on `nuxt-module-build` / `nuxi`.

## Playground

`playground/` is a normal Nuxt app that consumes this module (workspace-linked).

```bash
pnpm install

# Terminal 1 — Convex backend (writes NUXT_PUBLIC_CONVEX_URL to .env.local)
pnpm run dev:backend
# first time: npx @convex-dev/auth   # JWT_PRIVATE_KEY + JWKS

# Terminal 2 — Nuxt
pnpm run dev
```

| Route     | What it shows                                         |
| --------- | ----------------------------------------------------- |
| `/`       | SSR snapshot + live overlay (sign up, CRUD todos)     |
| `/server` | Nitro `fetchQuery` / `fetchMutation` / `fetchAction`  |
| `/files`  | `useConvexFileUpload` (upload, list, preview, delete) |
| `/extras` | `live: false`, pagination, action, connection state   |

On `/server`: `GET /api/health` is public; `GET`/`POST /api/tasks` use the cookie JWT; `POST /api/shout` is a public `fetchAction` demo.

## Releasing

Releases run from `.github/workflows/release.yml` when commits land on `main`. Version bumps follow [conventional commits](https://www.conventionalcommits.org/):

| Commit                         | Release |
| ------------------------------ | ------- |
| `fix:`                         | patch   |
| `feat:`                        | minor   |
| `feat!:` or `BREAKING CHANGE:` | major   |
| `chore:`, `docs:`, `ci:`, …    | none    |

semantic-release publishes `use-convex` to npm, tags `vX.Y.Z`, and opens a GitHub Release. The repo `package.json` version is not committed back.

## License

MIT
