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
    url: process.env.NUXT_PUBLIC_CONVEX_URL,
    auth: {
      provider: 'convex-auth',
      httpOnly: true,
      cookie: 'convex_jwt',
    },
  },
})
