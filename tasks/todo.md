# Expose hasSsrSession from the auth plugins

## Plan

- [x] Shared `useAuthJwtCookie` / `useSsrTokenRef` helper (same cookie options everywhere)
- [x] Plugins store a reactive `ssrToken` ref; server still seeds UI auth from it
- [x] `useConvexAuth` / `useAuth` expose `hasSsrSession`; persistTokens writes via the helper
- [x] Playground Live page drops cookie-name / `useCookie` plumbing
- [x] Tests, README, typecheck

## Review

- Pages no longer resolve `convex.auth.cookie`. Gate the signed-in shell with `isAuthenticated || hasSsrSession`; keep live queries on `isAuthenticated`.
- Both plugins share `useSsrTokenRef()` so HttpClient refreshes see cookie updates after sign-in.
- Verified: unit tests + typecheck pass; signed-in SSR HTML includes the task shell (not AuthForm); Live + Server routes still work with the JWT cookie.
