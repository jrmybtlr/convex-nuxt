<<<<<<< HEAD
# Better Convex file upload management

- [x] Add `useConvexFileUpload` composable + module auto-import/types
- [x] Add files schema + auth-gated generateUploadUrl/save/list/remove in playground
- [x] Wire upload/list/delete demo into playground extras
- [x] README docs + unit tests for upload success/failure/SSR guard

## Review

- `useConvexFileUpload` wraps generateUploadUrl → XHR POST (with progress) → saveFile
- Playground `files` table/functions enforce auth + ownership; extras page demos the flow
- Unit tests cover happy path, HTTP failure, and missing browser client; convex-test covers auth/CRUD
- README documents the composable and warns against unauthenticated `generateUploadUrl`
=======
# Playground + src cleanup (no functionality change)

## Scope

Cleanup only in `src/` and `playground/`: remove dead code, unused deps/re-exports, and safe internal deduplication. No API behavior changes for consumers.

## Plan

- [ ] Create branch `cursor/playground-src-cleanup-ff8a`
- [ ] Remove unused `getCurrentUser` from playground auth helper
- [ ] Drop unused `convex-helpers` from root + playground package.json
- [ ] Drop unused re-exports (`AUTH_JWT_COOKIE_MAX_AGE` from authCookie, `resolveFetchToken` from fetch)
- [ ] Register `AuthRefreshing` with the other auth layout components (already exists; docs/gate mention it)
- [ ] Dedup mutation/action pending/error runner
- [ ] Dedup `readConvexConfig` between server auth/fetch
- [ ] Simplify auth cookie option helpers
- [ ] Remove identity `mapLiveStatus` helper
- [ ] Dedup playground Nitro Convex auth error → 401 mapping
- [ ] Run typecheck + unit tests
- [ ] Commit, push, open PR

## Out of scope / risky (skip)

- Unifying `insertAtPosition` `===` vs `compareValues`
- Removing demo pages or public type re-exports
- Touching generated Convex files
- Aggressive comment deletion of hydration notes

## Review

(pending)
>>>>>>> 6dbfd69 (chore: clean up playground and src without behavior changes)
