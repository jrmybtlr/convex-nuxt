import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  modules: ['@convex/nuxt'],
  convex: {
    url: process.env.NUXT_PUBLIC_CONVEX_URL,
    auth: {
      // First-party Convex Auth: module owns plugin + useAuth / signIn / signOut.
      provider: 'convex-auth',
      // HttpOnly JWT + refresh via Nitro `/api/convex/auth/session` (Next.js parity).
      httpOnly: true,
    },
  },
})
