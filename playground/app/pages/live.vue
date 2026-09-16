<script setup lang="ts">
import AuthForm from '../components/AuthForm.vue'
import TasksDemo from '../components/TasksDemo.vue'

useHead({ title: 'Live · use-convex' })

const config = useRuntimeConfig()
const url = computed(() => (config.public.convex as { url?: string } | undefined)?.url)

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
  } catch (cause: unknown) {
    const err = cause as { statusMessage?: string; message?: string }
    showToast(err.statusMessage ?? err.message ?? 'Shout failed')
  } finally {
    shouting.value = false
  }
}
</script>

<template>
  <main class="shell-page">
    <ShellPrompt cmd="./live --ssr --auth" />
    <h1 class="shell-page__title">Convex + Nuxt SSR</h1>
    <p class="shell-page__lead">
      HTML is rendered from an HttpClient snapshot (JWT cookie when signed in). After hydration the
      live subscription takes over without a loading flash. Auth shell uses
      <code>showAuthedUi</code> / <code>&lt;Authenticated&gt;</code> so SSR HTML survives client
      confirmation.
    </p>

    <p v-if="!url" class="shell-warn">
      Run <code>pnpm run dev:backend</code> to write the Convex URL into <code>.env.local</code>,
      then restart <code>pnpm run dev</code>.
    </p>

    <template v-else>
      <AuthLoading>
        <p class="shell-dim shell-stack">resolving auth…</p>
      </AuthLoading>
      <AuthRefreshing>
        <p class="shell-dim shell-stack">refreshing session…</p>
      </AuthRefreshing>
      <Authenticated>
        <TasksDemo />
      </Authenticated>
      <Unauthenticated>
        <AuthForm />
      </Unauthenticated>

      <section class="shell-panel">
        <h2 class="shell-panel__title">shout</h2>
        <p class="shell-panel__meta">POST /api/shout via Nitro fetchAction</p>
        <form class="shell-row" @submit.prevent="runShout">
          <input
            v-model="shoutDraft"
            placeholder="text to shout"
            class="shell-input shell-input--grow"
          />
          <button type="submit" class="shell-btn" :disabled="shouting">
            {{ shouting ? '…' : 'shout' }}
          </button>
        </form>
      </section>
    </template>
  </main>
</template>
