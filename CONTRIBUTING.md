# Contributing to use-convex

## Setup

```bash
pnpm install
pnpm dev:prepare   # stub the module + prepare playground
```

Copy `.env.example` → `.env.local` (or let `convex dev` write `NUXT_PUBLIC_CONVEX_URL`).

This repo uses **[Vite+](https://viteplus.dev)** (`vp`) for:

- **Oxlint** — `pnpm lint` / `vp lint`
- **Oxfmt** — `pnpm fmt` / `vp fmt`
- **Vitest** — `pnpm test` / `vp test`

Nuxt module build and playground dev stay on `nuxt-module-build` / `nuxi`.

## Day-to-day

Two terminals:

```bash
# Terminal 1 — Convex backend (from repo root)
pnpm run dev:backend

# First-time Convex Auth keys (from playground/):
#   npx @convex-dev/auth

# Terminal 2 — Nuxt playground
pnpm run dev
```

## Checks before a PR

```bash
pnpm check                 # Oxfmt + Oxlint
pnpm test
pnpm typecheck
pnpm typecheck:playground
pnpm build
```

Optional live e2e (needs a running Convex deployment):

```bash
E2E_CONVEX=1 pnpm test:e2e
```

See `test/e2e/README.md`.

## Layout

| Path             | Role                                              |
| ---------------- | ------------------------------------------------- |
| `src/module.ts`  | Nuxt module (options, auto-imports, components)   |
| `src/runtime/`   | Client/server plugins, composables, Nitro helpers |
| `playground/`    | Demo Nuxt app (workspace-linked)                  |
| `test/`          | Vitest unit + Nuxt fixture tests                  |
| `vite.config.ts` | Vite+ lint / fmt / test / staged config           |

## Commits

This repo uses [conventional commits](https://www.conventionalcommits.org/) for semantic-release (`feat:`, `fix:`, `chore:`, …).
