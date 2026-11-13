<template>
  <pre id="fixture-dump">{{ dump }}</pre>
</template>

<script setup lang="ts">
import { useNuxtApp, useRuntimeConfig } from 'nuxt/app'

const config = useRuntimeConfig()
const app = useNuxtApp()
const convex = app.$convex as { url?: string; client: unknown | null } | undefined

// These are only auto-imported when provider === 'convex-auth'.
const dump = JSON.stringify({
  convex: config.public.convex,
  hasConvex: !!convex,
  hasUseAuth: typeof useAuth === 'function',
  hasUseConvexSignIn: typeof useConvexSignIn === 'function',
  hasUseOAuthSignIn: typeof useOAuthSignIn === 'function',
  hasUseOAuth: typeof useOAuth === 'function',
  hasSignOut: typeof signOut === 'function',
})
</script>
