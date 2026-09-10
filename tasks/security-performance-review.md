# Security & performance review — `@convex/nuxt`

**Scope:** Module source (`src/`) and playground patterns (`playground/`).  
**Mode:** Report only (no code changes).  
**Date:** 2026-09-10  
**Baseline:** `main` @ `931d59d`

## Summary

Auth and SSR design are generally sound: HttpOnly mode exists, OAuth code exchange requires a prior verifier, live queries can gate on Convex confirmation (`authenticated: true`), and playground Convex functions enforce ownership with validators and indexes.

The highest-priority issues are around **HttpOnly session semantics vs XSS** (GET returns the JWT), **CSRF fail-open when `Sec-Fetch-Site` is absent**, and **subscription churn in `useConvexQueries`**. Playground backend patterns are mostly good; a few demo shortcuts are worth documenting so they are not copied into production apps.

---

## Security

### Critical / high

#### 1. HttpOnly mode still exposes JWT to JavaScript via GET session

**Where:** [`src/runtime/server/api/convex/auth/session.ts`](../src/runtime/server/api/convex/auth/session.ts) (GET handler), consumed by [`src/runtime/composables/useAuth.ts`](../src/runtime/composables/useAuth.ts) (`fetchAuthSession`).

**Finding:** With `convex.auth.httpOnly: true`, JWT/refresh cookies are HttpOnly, but `GET /api/convex/auth/session` returns `{ hasSession, token }` including the raw JWT. Any same-origin XSS can `$fetch` the session endpoint and steal the token. HttpOnly therefore mitigates *cookie* theft via `document.cookie`, not *session* theft under XSS.

**Impact:** Overstates the XSS protection of the HttpOnly option; refresh remains in HttpOnly cookie, but access JWT is still exfiltrable.

**Recommendation (future fix):** Prefer a design where the WebSocket auth path does not require returning the JWT to page JS (or shorten token lifetime / bind refresh tightly). At minimum, document clearly that HttpOnly ≠ XSS-proof, and consider CSRF + Origin hardening on all session methods.

#### 2. CSRF check fails open when `Sec-Fetch-Site` is missing

**Where:** `assertSameOrigin` in [`session.ts`](../src/runtime/server/api/convex/auth/session.ts).

```ts
if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
  throw createError({ statusCode: 403, ... })
}
```

**Finding:** If the header is absent (older clients, some non-browser callers, stripped proxies), the request is allowed. Cookies use `SameSite=lax`, which blocks many classic cross-site POSTs, but **same-site** sibling-subdomain attackers and header-less clients remain a concern. When the header *is* present, `same-site` (sibling) is correctly rejected.

**Impact:** Session POST (set tokens / refresh) and DELETE (logout) / GET (token read) are weaker than a fail-closed Origin/`Sec-Fetch-Site` policy.

**Recommendation:** Fail closed unless `Sec-Fetch-Site` is `same-origin` or `none`, and/or require a matching `Origin`/`Host`. Consider a double-submit CSRF token for cookie-mutating POSTs.

### Medium

#### 3. Presence cookie is client-writable (UI session spoofing)

**Where:** [`authCookies.ts`](../src/runtime/server/authCookies.ts) (`presentOpts.httpOnly: false`), [`authStorage.ts`](../src/runtime/utils/authStorage.ts) (`DEFAULT_AUTH_PRESENT_COOKIE`).

**Finding:** `convex_auth_present=1` is readable/writable from JS. Forging it makes `hasSsrSession` / `showAuthedUi` true so the authenticated *shell* mounts. Live data with `{ authenticated: true }` still waits for Convex confirmation — docs already warn about this, and playground `TasksDemo` follows the pattern.

**Impact:** UI spoofing / flash of signed-in chrome; not authorization bypass if apps gate live queries correctly.

**Recommendation:** Keep documenting; optionally treat forged presence as UX-only and never key security UI solely on `showAuthedUi`.

#### 4. SSR stamps `isAuthenticated` from cookie presence without JWT validation

**Where:** [`plugin.server.ts`](../src/runtime/plugin.server.ts).

**Finding:** Any non-empty JWT cookie stamps auth for the SSR request so HttpClient can run gated queries. The client plugin does **not** copy this stamp (good). Invalid/expired cookies can cause failed SSR fetches; Convex still enforces auth on the backend.

**Impact:** Low for data leakage if Convex functions check auth; possible SSR errors or empty shells on bad cookies.

#### 5. OAuth redirect URL is trusted from Convex `auth:signIn`

**Where:** [`useAuth.ts`](../src/runtime/composables/useAuth.ts) — `window.location.href = new URL(result.redirect)`.

**Finding:** No allowlist on redirect host. This matches typical Convex Auth client behavior and assumes the Convex deployment is trusted. Compromised/misconfigured auth provider redirect settings could open an open redirect.

**Mitigation already present:** `shouldConsumeOAuthCode` requires a stored verifier before consuming `?code=` (good CSRF resistance on callback).

**Recommendation:** Optional allowlist of OAuth IdP hosts for defense in depth; document trust boundary.

#### 6. Default auth storage is XSS-friendly when `httpOnly` is false

**Where:** Module default `httpOnly: false`; JWT in readable cookie + refresh in `localStorage`.

**Finding:** Expected for simpler demos / BYO auth, but insecure as a production default for Convex Auth apps.

**Note:** Playground correctly sets `httpOnly: true` in [`playground/nuxt.config.ts`](../playground/nuxt.config.ts).

**Recommendation:** Document production recommendation toward `httpOnly: true`; consider changing default later with a migration note.

#### 7. `requireConvexAuth` / `requireConvexAuthMiddleware` only check cookie presence

**Where:** [`server/auth.ts`](../src/runtime/server/auth.ts), [`useAuthToken.ts`](../src/runtime/composables/useAuthToken.ts).

**Finding:** Nitro helpers throw 401 if the cookie is missing; they do not validate JWT signature/expiry. Actual authorization happens when Convex rejects bad tokens. `redirectTo` is app-supplied — if apps pass user-controlled URLs, open redirect risk is on the app.

**Recommendation:** Document that cookie presence ≠ verified session; apps must not treat middleware alone as proof of identity for non-Convex side effects without further checks.

### Low / informational

| Item | Notes |
|------|--------|
| No `eval` / user-driven dynamic import / `v-html` sinks in module | Good |
| Outbound HTTP only to configured Convex URL | No module-level SSRF |
| DevTools route `/__convex_devtools` | Dev-only; HTML-escapes JSON; exposes public config only |
| Cookie `secure` based on Host / localhost | Mis-set `Host` in weird proxies could weaken flags |
| `useConvexAuth` defaults `isAuthenticated` provider flag to `true` | Demo-friendly; Convex confirmation still gates final state |
| Session POST accepts caller-supplied tokens | By design for client→cookie handoff after sign-in; CSRF hardening matters more |

---

## Security — playground

### Strengths

- [`playground/convex/lib/auth.ts`](../playground/convex/lib/auth.ts): `getCurrentUserId`, `requireTaskOwner` — proper authz.
- [`playground/convex/tasks.ts`](../playground/convex/tasks.ts): args/returns validators; indexed `by_user`; ownership on toggle/remove.
- Nitro [`tasks.get.ts`](../playground/server/api/tasks.get.ts) / [`tasks.post.ts`](../playground/server/api/tasks.post.ts): `requireConvexAuth` + `fetch*` with `{ event }`.
- Client [`TasksDemo.vue`](../playground/app/components/TasksDemo.vue): `{ authenticated: true }` on live query; mutations gated on `isAuthenticated`.
- Schema is flat/relational with `by_user` index ([`schema.ts`](../playground/convex/schema.ts)).

### Issues / copy-paste hazards

| Severity | Finding |
|----------|---------|
| Low | [`shout` action](../playground/convex/tasks.ts) and [`/api/shout`](../playground/server/api/shout.post.ts) are unauthenticated — fine for a demo uppercase, but easy to copy as a pattern for privileged actions. |
| Low | `list` uses `.collect()` without pagination — OK for tiny demos; `listPaginated` shows the right production pattern. |
| Info | Playground enables HttpOnly correctly — good reference for production Nuxt apps. |

---

## Performance

### High

#### 1. `useConvexQueries` always resubscribes on deep watch

**Where:** [`useConvexQueries.ts`](../src/runtime/composables/useConvexQueries.ts).

**Finding:** `watch(..., { deep: true })` calls `sync`, which unsubscribes and resubscribes **every key** even when `query`/`args` are unchanged. Unstable object identity or nested reactive churn causes subscription storms and extra UI updates (`results.value = { ...results.value, [key]: value }`).

**Recommendation:** Diff by key; only resubscribe when query reference or args (stable serialized) change; prefer shallow watch + explicit dependency list where possible.

### Medium

#### 2. Default SSR + live doubles work per query

**Where:** Module default `server: true`, composable default `live: true` ([`useConvexQuery.ts`](../src/runtime/composables/useConvexQuery.ts)).

**Finding:** Each query does HttpClient SSR snapshot **and** WebSocket subscribe after hydration. Correct for Convex/Nuxt parity, but costly on pages with many queries.

**Recommendation:** Docs already allow `convex.server: false` or per-query `{ server: false }` / `{ live: false }`. Call out “SSR budget” guidance for list-heavy pages.

#### 3. Auth-gated re-subscribe / token watches

**Where:** `useConvexQuery` watches args + auth; `useAuthToken` may hit session GET on auth state transitions.

**Finding:** Expected for correctness; can amplify traffic around login/refresh. Session GET returning JWT makes each fetch heavier than a boolean `hasSession` check would be.

### Low

| Item | Notes |
|------|--------|
| Subscription cleanup via `onScopeDispose` | Generally solid in query/paginated/connection composables |
| `prewarmQuery` | Leak if called outside setup without keeping unsubscribe; can duplicate live subs with later `useConvexQuery` |
| Playground `list` `.collect()` | Fine for demo scale; prefer `listPaginated` in real apps |
| Optimistic paginated helpers | Useful; ensure apps don’t hold unbounded loaded pages without UX limits |

---

## What looks good

- Clear split: SSR HttpClient payload → client live overlay (`live ?? payload`).
- Auth shell (`showAuthedUi`) vs live gate (`isAuthenticated` / `authenticated: true`) is documented and used correctly in the playground.
- OAuth verifier gate before code consumption.
- HttpOnly cookie options: `httpOnly`, `sameSite: 'lax'`, `secure` off only for localhost Host.
- Nitro `fetchQuery` / `fetchMutation` / `fetchAction` with per-request token; README warns against putting JWTs in public runtime config.
- Playground Convex layer: validators, ownership checks, indexes, pagination example.

---

## Priority matrix (for a future fix pass)

| Priority | Item | Area |
|----------|------|------|
| P0 | Session GET returns JWT under HttpOnly | Security |
| P0 | CSRF `assertSameOrigin` fail-open | Security |
| P1 | `useConvexQueries` resubscribe churn | Performance |
| P1 | Document HttpOnly XSS limits + production `httpOnly: true` | Security / docs |
| P2 | Presence-cookie / `showAuthedUi` trust boundary docs | Security |
| P2 | SSR query budget guidance | Performance |
| P3 | OAuth redirect allowlist (optional) | Security |
| P3 | Playground unauth `shout` / `.collect()` callouts | Playground |

---

## Out of scope this pass

- Runtime Lighthouse / Web Vitals (playground not booted; no Convex env in this review).
- Implementing fixes (report only, per request).
- Dependency CVE audit / supply-chain scan.
