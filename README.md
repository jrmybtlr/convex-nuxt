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

const { data, pending, error } = await useConvexQuery(api.tasks.list, {}, { authenticated: true })
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
  { authenticated: true }, // wait for Convex auth before live subscribe
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
- **`token`** — authenticated SSR for this call only. Never put JWTs in `runtimeConfig.public`. Otherwise queries use the session token (Convex Auth SSR mode, or a BYO `convex.auth.cookie`).

Warm a subscription before a screen mounts:

```ts
prewarmQuery(api.tasks.list, {})
```

### Several queries

Browser-only live map (no SSR). Each value is `data | undefined` (loading) | `Error`. Combine with `useConvexQuery` when you need an SSR snapshot for known queries.

```ts
const results = useConvexQueries(
  () => ({
    tasks: { query: api.tasks.list, args: {} },
    files: showFiles.value ? { query: api.files.list, args: {} } : 'skip',
    // Per-entry gate (overrides the options bag when set):
    // admin: { query: api.admin.stats, args: {}, authenticated: true },
  }),
  { authenticated: true }, // wait for Convex auth before any subscribe
)
// results.value.tasks
```

`'skip'` still wins for missing ids / feature flags. Prefer `{ authenticated: true }` over wrapping every private entry yourself.

### Pagination

```ts
const { results, status, isLoading, loadMore } = await useConvexPaginatedQuery(
  api.tasks.listPaginated,
  {},
  { initialNumItems: 20, authenticated: true },
)
// loadMore() when status === 'CanLoadMore'
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
await mutate({ text: 'Ship it' }) // browser-only

const { run, pending, error } = useConvexAction(api.tasks.shout)
const shouted = await run({ text: 'hello' }) // browser-only
```

`useConvexAction` calls `ConvexClient.action`. Actions from one client run in parallel with each other and with mutations. If a later call depends on an earlier one, await the earlier call before starting the next.

A failed action stays failed: Convex leaves retry to the caller, because the action may already have performed a side effect. `run` throws and sets `error`. Retry from your code when repeating the action is safe.

Use `useConvexAction` (and `fetchAction`) for work the user is waiting on. For durable work, write the user's intent in a mutation and schedule an `internalAction` from that mutation.

For paginated lists:

```ts
insertAtTop({
  paginatedQuery: api.tasks.listPaginated,
  localQueryStore: localStore,
  item: { _id: 'tmp', text: args.text, completed: false },
})
```

Also available: `insertAtBottomIfLoaded`, `insertAtPosition`, `optimisticallyUpdateValueInPaginatedQuery`.

`useConvex()` returns the browser `ConvexClient` when you need an escape hatch. `useConvexConnectionState()` is a reactive `ShallowRef<ConnectionState | null>` (WebSocket status: `isWebSocketConnected`, `hasInflightRequests`, …).

## File uploads

Convex file storage is a three-step client flow: generate a short-lived upload URL, `POST` the file bytes, then save the returned `storageId` in a mutation. `useConvexFileUpload` wraps that for Nuxt (browser-only, with `pending` / `error` / `progress`).

```ts
const { upload, pending, error, progress } = useConvexFileUpload({
  generateUploadUrl: api.files.generateUploadUrl,
  saveFile: api.files.save, // ({ storageId, name, contentType, size, ... }) => Id<"files">
})

await upload(file) // progress: 0..1 while bytes fly
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
// Pass r2.clientApi() exports: { generateUploadUrl, syncMetadata }
const { upload, pending, error, progress } = useConvexR2Upload(api.r2)
const key = await upload(file) // R2 object key
```

That runs `generateUploadUrl` → `PUT` to the signed URL → `syncMetadata({ key })`, with XHR progress. Use built-in `useConvexFileUpload` for Convex storage; use this helper when you adopt the R2 component.

## Auth

### Convex Auth (v2)

First-party support for [Convex Auth v2](https://docs.convex.dev/auth/convex-auth/) (`@convex-dev/auth@^2`), built on its framework-agnostic `AuthClient` (`@convex-dev/auth/browser`) and SSR handlers (`@convex-dev/auth/ssr`). Requires `convex@^1.48`.

```bash
npm i @convex-dev/auth
```

```ts
convex: {
  url: process.env.NUXT_PUBLIC_CONVEX_URL,
  auth: {
    provider: 'convex-auth',
    // Every Convex function that can issue a session. The SSR auth proxy refuses the rest.
    signIn: ['auth:signInWithUsernamePassword', 'auth:signUpWithUsernamePassword'],
    // mode: 'ssr',                       // default; or 'spa'
    // api: { refreshSession, signOut, isAuthenticated }, // default 'auth:<name>'
    // routePrefix: '/api/convex/auth',
    // cookieOptions: { secure, domain, path },
    // allowedOrigins: ['https://app.example.com'],
    // storage: 'localStorage',           // or 'inMemory'
    // storageNamespace: 'myapp',         // default = deployment URL
    // verbose: false,
  },
}
```

**Session models**

| `mode`          | Refresh token                      | Sign-in calls                       | SSR                                                 |
| --------------- | ---------------------------------- | ----------------------------------- | --------------------------------------------------- |
| `ssr` (default) | httpOnly cookie, set by Nitro      | `POST <prefix>/signin` (auth proxy) | Authenticated; access token refreshed by middleware |
| `spa`           | `localStorage` (or custom storage) | Straight to Convex                  | Signed out until the client restores                |

In SSR mode the module mounts `<prefix>/signin`, `<prefix>/refresh` and `<prefix>/signout` (Convex Auth's `setupConvexAuthServer` handlers, with their CSRF origin check) and a Nitro middleware. Access tokens live 60 seconds, so the middleware refreshes an expiring token from the refresh cookie before SSR queries run, rotates both cookies, and hands the fresh token to the client payload. `signIn`, `allowedOrigins` and `cookieOptions` are server-only (`runtimeConfig.convexAuth`).

**Sign in.** Each v2 method exports its own typed functions. `useConvexSignIn` runs any of them through the right transport and adopts the session it returns:

```vue
<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { run: signIn, pending } = useConvexSignIn(api.auth.signInWithUsernamePassword)
const { signOut, showAuthedUi } = useAuth()

async function submit() {
  const result = await signIn({ username, password })
  if (result.status === 'error') {
    // result.userError.error: 'INVALID_CREDENTIALS' | 'RATE_LIMITED' | … | 'OTHER_ERROR'
  }
}
</script>

<template>
  <AuthLoading>Resolving…</AuthLoading>
  <AuthRefreshing>Refreshing session…</AuthRefreshing>
  <Authenticated>
    <button @click="signOut()">Sign out</button>
  </Authenticated>
  <Unauthenticated>
    <!-- sign-in form -->
  </Unauthenticated>
</template>
```

Pass `{ kind: 'action' }` when a sign-in function is an action (function kinds are type-only).

**OAuth** (GitHub, Google, Apple). Starting a flow navigates to the provider. The callback (`?convexAuthCode=`) is finished on whichever page it lands, and the params are stripped from the URL and from `vue-router`:

```ts
const { signIn } = useOAuthSignIn({
  providerName: 'github',
  startSignIn: api.auth.startSignInWithGithub,
  completeSignIn: api.auth.completeSignInWithGithub, // list it in `signIn` for SSR mode
})
await signIn() // or signIn({ redirectTo: '/after-login' })

const { flowError } = useOAuth() // ACCESS_DENIED | EXPIRED | INVALID_FLOW | OTHER_ERROR
```

`useAuth()` returns `isLoading`, `isAuthenticated`, `isRefreshing`, `hasSsrSession`, `showAuthedUi`, `token`, `setSession(bundle)` and `signOut()`. While signed in, the client subscribes to your `isAuthenticated` query, so a session revoked on the server signs the browser out right away.

Prefer `<Authenticated>` (or `showAuthedUi`) so SSR HTML does not flash the sign-in form. Gate private queries with `{ authenticated: true }`.

For a custom `TokenStorage`, extra ambient sign-ins, or a custom `replaceUrl`, call `configureConvexAuth` from a client plugin that runs first:

```ts
// plugins/convex-auth-options.client.ts
export default defineNuxtPlugin({
  name: 'convex-auth-options',
  enforce: 'pre',
  setup() {
    configureConvexAuth({
      storage: { getItem, setItem, removeItem }, // may be async
      // ambientSignIns: [convexOAuth()],       // [] disables OAuth callback handling
    })
  },
})
```

You own the Convex backend (see the [v2 docs](https://docs.convex.dev/auth/convex-auth/) and `playground/convex`):

- `convex/convex.config.ts`: `app.use(auth)` plus each method's components (e.g. `authPassword`, `authUsername`)
- `convex/auth.config.ts`: `providers: [convexAuthProvider()]`
- `convex/auth.ts`: `setupConvexAuth({ component: components.auth })` exporting `signOut`, `refreshSession`, `isAuthenticated`, plus each method's sign-in functions
- Your own `users` table and a `createUser` callback. No `authTables`, `JWT_PRIVATE_KEY` or `JWKS`.

#### Migrating from v1 (`use-convex` 0.x)

- Backend: follow Convex's [v1 → v2 guide](https://docs.convex.dev/auth/convex-auth/migrating/from-convex-auth-v1).
- `signIn(provider, params)` is gone. Use `useConvexSignIn(api.auth.<fn>)` or `useOAuthSignIn(refs)`.
- `useAuth()` no longer returns `signIn`, `pending` or `error`. Sign-in results come back as `{ status, userError }`.
- Options removed: `httpOnly`, `presentCookie`, `shouldHandleCode` (and `configureConvexAuth({ replaceURL, shouldHandleCode, storageNamespace })`). SSR mode is the default and keeps the refresh token in an httpOnly cookie. `replaceURL` is now `replaceUrl`.
- `cookie` applies only to bring-your-own providers. Convex Auth uses `__convexAuthJWT` / `__convexAuthRefreshToken`.
- `/api/convex/auth/session` is replaced by `<prefix>/signin|refresh|signout`. List every session-issuing function in `convex.auth.signIn`.

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

Nitro helpers are auto-imported in `server/`. Pass the H3 `event` so they resolve the deployment URL and the session JWT (Convex Auth SSR mode or a BYO cookie):

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

```ts
// server/api/shout.post.ts
export default defineEventHandler(async (event) => {
  requireConvexAuth(event)
  const { text } = await readBody(event)
  return await fetchAction(api.tasks.shout, { text }, { event })
})
```

`fetchAction` uses the same options. Each helper builds a fresh `ConvexHttpClient`. Override with `{ token }` when you already have a JWT. Pass `{ adminToken }` (deploy key / admin key) for privileged server tooling — same as Next.js `fetchQuery` (user `token` is ignored when `adminToken` is set). `getConvexToken(event)` reads the cookie without throwing.

`fetchAction` throws on failure. Convex leaves retry to the caller, because the action may already have performed a side effect. Retry in the route when repeating the action is safe. Use `fetchAction` for work the request is waiting on. For durable work, write the intent in a mutation and schedule an `internalAction` from that mutation. Browser actions run in parallel with each other and with mutations; see [Mutations and actions](#mutations-and-actions).

## Config

```ts
convex: {
  url: process.env.NUXT_PUBLIC_CONVEX_URL,
  server: true, // SSR snapshots; override per query with { server }
  client: { unsavedChangesWarning: false }, // forwarded to new ConvexClient()
  auth: {
    provider: 'convex-auth', // omit for BYO providers
    mode: 'ssr', // or 'spa'
    signIn: ['auth:signInWithUsernamePassword'], // SSR auth proxy allowlist (server-only)
    // api: { refreshSession: 'auth:refreshSession', signOut: 'auth:signOut', isAuthenticated: 'auth:isAuthenticated' },
    // routePrefix: '/api/convex/auth',
    // cookieOptions: { secure: true, domain: undefined, path: '/' },
    // allowedOrigins: [],
    // storage: 'localStorage', // or 'inMemory'
    // storageNamespace: 'myapp',
    // verbose: false,
    // cookie: 'convex_jwt', // BYO providers only
  },
}
```

`url` also reads `NUXT_PUBLIC_CONVEX_URL` via `runtimeConfig.public.convex.url`, so you can change the deployment without rebuilding.

## Nuxt DevTools

In development, a **Convex** tab appears in [Nuxt DevTools](https://devtools.nuxt.com). It embeds the official [hosted dashboard](https://docs.convex.dev/platform-apis/embedded-dashboard) for `*.convex.cloud` URLs and shows module config / tips.

- **Open dashboard** deep-links to `dashboard.convex.dev` (uses your existing Convex login).
- **Auto-login** in the embed needs `CONVEX_DEPLOY_KEY` in the Nuxt process environment (e.g. `.env.local`). Without it, the iframe shows Convex’s credential form.
- A deploy key inlined into the DevTools page is visible to anyone who can reach your local `nuxt dev` server — only set it for trusted local machines.
- Local / self-hosted backends are not embedded; use the Open dashboard link or the CLI dashboard instead.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Lint/format/test use **Vite+** (`vp`) — Oxlint, Oxfmt, and Vitest — while Nuxt module build/dev stay on `nuxt-module-build` / `nuxi`.

## Playground

`playground/` is a normal Nuxt app that consumes this module (workspace-linked).

```bash
pnpm install

# Terminal 1 — Convex backend (writes CONVEX_URL to playground/.env.local)
pnpm run dev:backend

# Terminal 2 — Nuxt
pnpm run dev
```

| Route     | What it shows                                                         |
| --------- | --------------------------------------------------------------------- |
| `/`       | Shell session: features + composable call-shape demos                 |
| `/live`   | SSR snapshot + live overlay (username + password sign up, CRUD todos) |
| `/server` | Nitro `fetchQuery` / `fetchMutation` / `fetchAction`                  |
| `/files`  | `useConvexFileUpload` (upload, list, preview, delete)                 |
| `/extras` | `live: false`, pagination, action, connection state                   |

On `/server`: `GET /api/health` is public; `GET`/`POST /api/tasks` and `POST /api/shout` use the session JWT (refreshed by the Convex Auth middleware). `POST /api/shout` is an authenticated `fetchAction` demo.

## Releasing

Releases run from `.github/workflows/release.yml` when commits that touch `src/` land on `main` (or when the workflow is run manually). Version bumps follow [conventional commits](https://www.conventionalcommits.org/):

| Commit                         | Release |
| ------------------------------ | ------- |
| `feat!:` or `BREAKING CHANGE:` | major   |
| `feat:`                        | minor   |
| anything else under `src/`     | patch   |

semantic-release publishes `use-convex` to npm, tags `vX.Y.Z`, and opens a GitHub Release. The repo `package.json` version is not committed back.

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC), not an `NPM_TOKEN`. On [the `use-convex` package settings](https://www.npmjs.com/package/use-convex?activeTab=settings) add a GitHub Actions trusted publisher:

- **Organization or user:** `jrmybtlr`
- **Repository:** `convex-nuxt`
- **Workflow filename:** `release.yml`
- **Environment:** leave empty
- **Allowed actions:** include **`npm publish`** (new publishers default to staged publish only)

## License

MIT
