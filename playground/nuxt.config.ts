import tailwindcss from '@tailwindcss/vite'
import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  modules: ['../src/module'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  convex: {
    url: process.env.NUXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL,
    auth: {
      provider: 'convex-auth',
      // SSR mode (default): refresh token in an httpOnly cookie, sign-ins
      // through the Nitro auth proxy. Every session-issuing function must be
      // listed here.
      signIn: ['auth:signInWithUsernamePassword', 'auth:signUpWithUsernamePassword'],
    },
  },
})
