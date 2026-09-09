# npm publish on merge to main

## Plan

- [x] Add `.github/workflows/release.yml` (verify then semantic-release, pnpm, OIDC permissions)
- [x] Add `release.config.js`, pin `semantic-release`, set `publishConfig.access: public`
- [x] Document conventional commits, first-release versioning, and npm trusted publisher setup

## Review

- Workflow runs on `push` to `main` and `workflow_dispatch`: verify (`test` / `typecheck` / `build`) then release.
- Release job uses `id-token: write` for npm trusted publishing; optional `NPM_TOKEN` secret as fallback.
- semantic-release plugins: commit-analyzer, release-notes-generator, npm, github (no `@semantic-release/git`).
- Repository URL set to `jrmybtlr/convex-nuxt`; README Releasing section + roadmap item checked.
- Local `semantic-release --dry-run` loads config; auth failures expected without CI tokens.
