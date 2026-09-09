export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  modules: ['../src/module'],
  convex: {
    url: process.env.NUXT_PUBLIC_CONVEX_URL,
    auth: {
      // Playground mirrors the JWT into this cookie after sign-in for SSR.
      cookie: 'convex_jwt',
    },
  },
})
