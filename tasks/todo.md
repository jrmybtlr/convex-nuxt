# Optional first-party Convex Auth

## Plan

- [x] Extend ModuleAuthOptions with provider + default cookie; gate plugin and auto-imports
- [x] Port playground useAuth into module runtime (signIn/signOut, storage, cookie, refresh mutex, OAuth)
- [x] Add plugin.auth.client.ts that hydrates, finishes OAuth, and wires useConvexAuth
- [x] Switch playground to provider: convex-auth; delete app-owned useAuth + auth plugin
- [x] Unit tests for adapter helpers; README Convex Auth vs BYO; roadmap

## Review

- Opt-in `convex.auth.provider: 'convex-auth'` registers `plugin.auth.client` and auto-imports `useAuth` / `signIn` / `signOut`.
- Cookie defaults to `convex_jwt` when the provider is set; BYO path unchanged.
- Client talks to `auth:signIn` / `auth:signOut` via `makeFunctionReference` (no `@convex-dev/auth` runtime dep).
- OAuth: store verifier on redirect; consume `?code=` only when a verifier exists.
- Playground no longer owns auth adapter/plugin — forms call module APIs only.
- Auth plugin / `useAuth` no-op gracefully when Convex URL is unset (avoids HMR 500s).
- Verified: SSR HTML includes Sign-in form + `auth.provider: "convex-auth"`; unit tests + typecheck + module build pass.
