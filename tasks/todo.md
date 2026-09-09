# Playground Tailwind via Vite

## Plan

- [x] Install `tailwindcss` + `@tailwindcss/vite` in playground
- [x] Register the Vite plugin and global CSS in `nuxt.config.ts`
- [x] Add `app/assets/css/main.css` with `@import "tailwindcss"`
- [x] Restyle `app.vue` as a minimal layout shell
- [x] Replace inline styles on playground pages/components with simple utilities
- [x] Verify in the browser (nav + Live / Server / Extras)

## Review

Tailwind v4 is wired through `@tailwindcss/vite` in `playground/nuxt.config.ts` (no PostCSS / Nuxt Tailwind module). The app shell is a centered `max-w-xl` column with muted nav and zinc borders. Inline styles on Live, Server, Extras, AuthForm, and TasksDemo were replaced with the same small utility set.

Verified at `http://localhost:3000/`:
- Live: sign-in / create-account toggle
- Server: health JSON, GET list error, shout form
- Extras: unsigned-in empty state
- Computed styles confirm Tailwind (`flex` nav, `max-w-xl` = 576px, `text-xl` = 20px)
