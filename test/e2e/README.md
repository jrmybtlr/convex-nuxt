# SSR / live e2e (optional)

These checks need a running Convex deployment and the playground app.

## Prerequisites

```bash
pnpm run dev:backend   # terminal 1 — writes NUXT_PUBLIC_CONVEX_URL
pnpm run dev           # terminal 2
```

## Manual checklist

1. Sign up / sign in on `/` — task list SSR HTML should include tasks after refresh.
2. Hard refresh while signed in — list must not flash the sign-in form (`showAuthedUi` / `<Authenticated>`).
3. Toggle a task — live overlay updates without a full reload.
4. `/server` — `GET /api/tasks` returns 401 signed out, 200 after Live sign-in (HttpOnly cookie).
5. `/extras` — `live: false` refresh, paginated load more, shout action, connection state.

## Automated

Set `E2E_CONVEX=1` and run:

```bash
E2E_CONVEX=1 pnpm exec vitest run test/e2e/ssr-hydrate.test.ts
```

The test is skipped unless that env var is set (CI stays offline-only).
