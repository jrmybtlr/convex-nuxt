<script setup lang="ts">
import AuthForm from '../components/AuthForm.vue'
import TasksDemo from '../components/TasksDemo.vue'

const config = useRuntimeConfig()
const url = computed(
  () => (config.public.convex as { url?: string } | undefined)?.url,
)

const { isAuthenticated, isLoading } = useConvexAuth()
const jwtCookie = useCookie('convex_jwt')
const showTasks = computed(
  () => isAuthenticated.value || !!jwtCookie.value,
)
</script>

<template>
  <main style="font-family: system-ui; max-width: 720px; margin: 5rem auto; padding: 0 1rem">
    <h1>Convex + Nuxt SSR</h1>
    <p style="color: #555">
      HTML is rendered from an HttpClient snapshot (JWT cookie when signed in).
      After hydration the live subscription takes over without a loading flash.
    </p>

    <p
      v-if="!url"
      style="padding: 1rem; background: #fff8e1; border-radius: 8px"
    >
      Set <code>NUXT_PUBLIC_CONVEX_URL</code> by running
      <code>pnpm run dev:backend</code> (from
      <code>playground/</code>: <code>npx convex dev</code>), then restart
      <code>pnpm run dev</code>.
    </p>

    <template v-else>
      <p
        v-if="isLoading && !showTasks"
        style="color: #555"
      >
        Resolving auth…
      </p>
      <TasksDemo v-else-if="showTasks" />
      <AuthForm v-else />
    </template>
  </main>
</template>
