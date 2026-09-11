# Playground + src cleanup (no functionality change)

## Scope

Cleanup only in `src/` and `playground/`: remove dead code, unused deps/re-exports, and safe internal deduplication. No API behavior changes for consumers.

## Plan

- [x] Create branch `cursor/playground-src-cleanup-ff8a`
- [x] Remove unused `getCurrentUser` from playground auth helper
- [x] Drop unused `convex-helpers` from root + playground package.json
- [x] Drop unused re-exports (`AUTH_JWT_COOKIE_MAX_AGE` from authCookie, `resolveFetchToken` from fetch)
- [x] Register `AuthRefreshing` (already on main via #4; no-op after rebase)
- [x] Dedup mutation/action pending/error runner
- [x] Dedup `readConvexConfig` between server auth/fetch
- [x] Simplify auth cookie option helpers
- [x] Remove identity `mapLiveStatus` helper
- [x] Dedup playground Nitro Convex auth error → 401 mapping
- [x] Extract shared HttpOnly payload-cache helper for query composables
- [x] Rebase onto latest `main` (AuthRefreshing + upload features)
- [x] Run typecheck + unit tests
- [x] Commit, push, open PR

## Out of scope / risky (skip)

- Unifying `insertAtPosition` `===` vs `compareValues`
- Removing demo pages or public type re-exports
- Touching generated Convex files
- Aggressive comment deletion of hydration notes

## Review

Recheck after rebase onto `main` (#3/#4):
- PR was `CONFLICTING`; rebased cleanly. `AuthRefreshing` registration already on main, so it dropped from this PR’s diff.
- Auth error status messages unchanged vs main.
- `pnpm test` 103 passed / 4 skipped; `pnpm typecheck` clean.
- Remaining diff is dead-code removal + shared helpers only; merge-base is current `origin/main`.
