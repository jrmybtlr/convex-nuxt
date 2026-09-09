<script setup lang="ts">
import AuthForm from '../components/AuthForm.vue'
import TasksDemo from '../components/TasksDemo.vue'

const config = useRuntimeConfig()
const url = computed(
  () => (config.public.convex as { url?: string } | undefined)?.url,
)
</script>

<template>
  <main class="py-10">
    <h1 class="text-xl font-medium tracking-tight">
      Convex + Nuxt SSR
    </h1>
    <p class="mt-3 text-sm leading-relaxed text-zinc-500">
      HTML is rendered from an HttpClient snapshot (JWT cookie when signed in).
      After hydration the live subscription takes over without a loading flash.
      Auth shell uses <code>showAuthedUi</code> /
      <code>&lt;Authenticated&gt;</code> so SSR HTML survives client confirmation.
    </p>

    <p
      v-if="!url"
      class="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      Set <code>NUXT_PUBLIC_CONVEX_URL</code> by running
      <code>pnpm run dev:backend</code>, then restart
      <code>pnpm run dev</code>.
    </p>

    <template v-else>
      <AuthLoading>
        <p class="mt-6 text-sm text-zinc-500">
          Resolving auth…
        </p>
      </AuthLoading>
      <Authenticated>
        <TasksDemo />
      </Authenticated>
      <Unauthenticated>
        <AuthForm />
      </Unauthenticated>
    </template>
  </main>
</template>
