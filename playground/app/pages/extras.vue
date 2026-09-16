<script setup lang="ts">
import ExtrasDemo from '../components/ExtrasDemo.vue'

useHead({ title: 'Extras · use-convex' })

const config = useRuntimeConfig()
const url = computed(() => (config.public.convex as { url?: string } | undefined)?.url)
</script>

<template>
  <main class="shell-page">
    <ShellPrompt cmd="./extras --demo" />
    <h1 class="shell-page__title">Extras</h1>
    <p class="shell-page__lead">
      Demos for <code>live: false</code>, <code>useConvexPaginatedQuery</code>,
      <code>useConvexAction</code>, and <code>useConvexConnectionState</code>. File uploads live on
      <NuxtLink to="/files">Files</NuxtLink>. Sign in on
      <NuxtLink to="/live">Live</NuxtLink> first.
    </p>

    <p v-if="!url" class="shell-warn">
      Run <code>pnpm run dev:backend</code> to write the Convex URL into <code>.env.local</code>,
      then restart <code>pnpm run dev</code>.
    </p>
    <ExtrasDemo v-else />
  </main>
</template>
