<template>
  <pre id="fixture-dump">{{ dump }}</pre>
</template>

<script setup lang="ts">
import { useNuxtApp, useRuntimeConfig } from 'nuxt/app'

const config = useRuntimeConfig()
const app = useNuxtApp()
const convex = app.$convex as
  | { url?: string, client: unknown | null }
  | undefined

// These are only auto-imported when provider === 'convex-auth'.
const hasUseAuth = typeof useAuth === 'function'
const hasSignIn = typeof signIn === 'function'
const hasSignOut = typeof signOut === 'function'

const dump = JSON.stringify({
  convex: config.public.convex,
  hasConvex: !!convex,
  hasUseAuth,
  hasSignIn,
  hasSignOut,
})
</script>
