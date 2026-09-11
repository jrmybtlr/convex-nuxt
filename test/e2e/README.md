# SSR / live e2e (optional)

These checks need a running Convex deployment and the playground app.

## Prerequisites

```bash
pnpm run dev:backend   # terminal 1 — writes CONVEX_URL to playground/.env.local
pnpm run dev           # terminal 2
```

## Manual checklist

1. Sign up / sign in on `/` — task list SSR HTML should include tasks after refresh.
2. Hard refresh while signed in — list must not flash the sign-in form (`showAuthedUi` / `<Authenticated>`).
3. Toggle a task — live overlay updates without a full reload.
4. `/server` — `GET /api/tasks` returns 401 signed out, 200 after Live sign-in (HttpOnly cookie).
5. `/extras` — `live: false` refresh, paginated load more, shout action, connection state.

## Automated

Set `E2E_CONVEX=1` (or use the script) and run against the live app:

```bash
# Smoke: Live HTML, health, unauthenticated /api/tasks → 401
E2E_CONVEX=1 pnpm exec vitest run test/e2e/ssr-hydrate.test.ts

# Full playground flow: unique signup → Nitro tasks/shout → toggle → SSR HTML → delete created tasks
pnpm test:e2e
```

Env:

| Variable                                | Default                      | Role                                                 |
| --------------------------------------- | ---------------------------- | ---------------------------------------------------- |
| `E2E_CONVEX`                            | unset                        | Must be `1` or tests are skipped (CI stays offline)  |
| `E2E_BASE_URL`                          | `http://localhost:3000`      | Playground origin                                    |
| `NUXT_PUBLIC_CONVEX_URL` / `CONVEX_URL` | from `playground/.env.local` | Convex deployment for `auth:signIn` + task mutations |

The full-flow test rolls back by deleting tasks whose text starts with `e2e:<runId>:`. Auth users are left behind (no user-delete API); unique emails avoid collisions.
