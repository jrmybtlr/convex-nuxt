# Auth-gated query option

## Plan

- [x] Add `authenticated?: boolean` to `useConvexQuery` and `useConvexPaginatedQuery`
- [x] Split raw vs effective args; keys from raw; watch `isAuthenticated` for live
- [x] Switch TasksDemo + extras to `{ authenticated: true }`
- [x] Update README
- [x] Unit tests + playground verify

## Review

**Plugin:** `{ authenticated: true }` skips HttpClient/live until Convex confirms
`isAuthenticated`. SSR still snapshots when the server stamps auth from the JWT
cookie. Overlay keeps the payload. Keys stay on raw args so auth-skip does not
lose the SSR slot. HttpOnly clients do not anonymous-refetch via HttpClient
(preserve payload; live subscribe owns the browser after `setAuth`).

**Playground:** TasksDemo / extras use `{ authenticated: true }` instead of a
manual skip computed. Also fixed `listPaginated` returns validator (`pageStatus`
/ `splitCursor`) so pagination SSR works on current Convex.

**Verified:**
- Unit + nuxt tests pass (81)
- Live `/`: SSR payload includes tasks; hydrates signed-in without loading flash
- Extras: `live: false` snapshot + paginated list both show 2 items (`Exhausted · 2 items`)
