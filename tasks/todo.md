# Security & performance fixes

- [x] Harden session API: CSRF fail-closed; GET returns `hasSession` only; JWT via POST `{ getToken: true }`
- [x] Fix `useConvexQueries` to skip resubscribe when query/args unchanged
- [x] Docs: HttpOnly XSS limits, `showAuthedUi`, SSR budget, prefer `httpOnly: true`
- [x] OAuth redirect: allow only http(s)
- [x] Playground: auth-required `shout`; cap `list` with `.take(100)`
- [x] Tests: same-origin, oauth redirect, queries resubscribe, shout auth; typecheck + unit + nuxt

## Review

Fixes for findings in [security-performance-review.md](./security-performance-review.md). Unit + Nuxt tests pass; Convex E2E remains skipped without `E2E_CONVEX=1`.
