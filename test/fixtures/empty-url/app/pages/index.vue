<template>
  <pre id="fixture-dump">{{ dump }}</pre>
</template>

<script setup lang="ts">
import { useNuxtApp, useRuntimeConfig } from 'nuxt/app'

const config = useRuntimeConfig()
const app = useNuxtApp()
const convex = (app as { $convex?: unknown }).$convex

const dump = JSON.stringify({
  convex: config.public.convex,
  hasConvex: !!convex,
  ok: true,
})
</script>
