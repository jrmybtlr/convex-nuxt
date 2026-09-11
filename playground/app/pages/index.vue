<script setup lang="ts">
import AuthForm from '../components/AuthForm.vue'
import TasksDemo from '../components/TasksDemo.vue'

const config = useRuntimeConfig()
const url = computed(
  () => (config.public.convex as { url?: string } | undefined)?.url,
)

const { showToast } = useToast()
const shoutDraft = ref('hello')
const shouting = ref(false)

async function runShout() {
  const text = shoutDraft.value.trim()
  if (!text || shouting.value) {
    return
  }
  shouting.value = true
  try {
    const result = await $fetch<{ shouted: string }>('/api/shout', {
      method: 'POST',
      body: { text },
    })
    showToast(result.shouted)
  }
  catch (cause: unknown) {
    const err = cause as { statusMessage?: string, message?: string }
    showToast(err.statusMessage ?? err.message ?? 'Shout failed')
  }
  finally {
    shouting.value = false
  }
}
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
      <AuthRefreshing>
        <p class="mt-6 text-sm text-zinc-500">
          Refreshing session…
        </p>
      </AuthRefreshing>
      <Authenticated>
        <TasksDemo />
      </Authenticated>
      <Unauthenticated>
        <AuthForm />
      </Unauthenticated>

      <form
        class="mt-8 flex flex-wrap gap-2 border-t border-zinc-100 pt-6"
        @submit.prevent="runShout"
      >
        <input
          v-model="shoutDraft"
          placeholder="Text to shout"
          class="min-w-0 flex-1 rounded-md border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
        >
        <button
          type="submit"
          class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50"
          :disabled="shouting"
        >
          {{ shouting ? '…' : 'Shout' }}
        </button>
      </form>
    </template>
  </main>
</template>
