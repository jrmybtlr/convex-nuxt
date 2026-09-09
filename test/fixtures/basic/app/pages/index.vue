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

const dump = JSON.stringify({
  convex: config.public.convex,
  hasConvex: !!convex,
  url: convex?.url ?? null,
  clientIsNull: convex ? convex.client === null : null,
})
</script>
