<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { isAuthenticated, showAuthedUi } = useAuth()

const {
  data: snapshot,
  pending: snapshotPending,
  refresh,
} = await useConvexQuery(
  api.tasks.list,
  {},
  {
    live: false,
    authenticated: true,
  },
)

const { results, status, isLoading, loadMore } = await useConvexPaginatedQuery(
  api.tasks.listPaginated,
  {},
  { initialNumItems: 5, authenticated: true },
)

const { showToast } = useToast()
const { run: shout, pending: shouting } = useConvexAction(api.tasks.shout)
const shoutInput = ref('hello convex')

async function runShout() {
  const text = shoutInput.value.trim()
  if (!text) {
    return
  }
  try {
    showToast(await shout({ text }))
  } catch (cause: unknown) {
    const err = cause as { message?: string }
    showToast(err.message ?? 'Shout failed')
  }
}

const connection = useConvexConnectionState()
</script>

<template>
  <div>
    <p v-if="!showAuthedUi" class="shell-muted shell-stack">not signed in.</p>

    <template v-else>
      <section class="shell-panel">
        <h2 class="shell-panel__title">connection</h2>
        <p class="shell-panel__meta">useConvexConnectionState()</p>
        <pre class="shell-pre">{{ connection }}</pre>
      </section>

      <section class="shell-panel">
        <h2 class="shell-panel__title">live: false snapshot</h2>
        <p class="shell-panel__meta">HttpClient only — no WebSocket overlay</p>
        <div class="shell-row">
          <button
            type="button"
            class="shell-btn"
            :disabled="!isAuthenticated"
            @click="refresh()"
          >
            refresh HttpClient
          </button>
        </div>
        <p v-if="snapshotPending" class="shell-muted shell-stack--md">loading…</p>
        <ul v-else class="shell-list">
          <li v-for="task in snapshot ?? []" :key="task._id" class="shell-list__item">
            {{ task.text }}
          </li>
        </ul>
      </section>

      <section class="shell-panel">
        <h2 class="shell-panel__title">paginated list</h2>
        <p class="shell-panel__meta">status: {{ status }} · {{ results.length }} items</p>
        <ul class="shell-list">
          <li v-for="task in results" :key="task._id" class="shell-list__item">
            {{ task.text }}
          </li>
        </ul>
        <div class="shell-row">
          <button
            type="button"
            class="shell-btn"
            :disabled="status !== 'CanLoadMore' || isLoading"
            @click="loadMore()"
          >
            {{ isLoading ? '…' : 'load more' }}
          </button>
        </div>
      </section>

      <section class="shell-panel">
        <h2 class="shell-panel__title">useConvexAction</h2>
        <p class="shell-panel__meta">browser action → toast</p>
        <form class="shell-row" @submit.prevent="runShout">
          <input v-model="shoutInput" class="shell-input shell-input--grow" />
          <button type="submit" class="shell-btn" :disabled="shouting">
            {{ shouting ? '…' : 'shout' }}
          </button>
        </form>
      </section>
    </template>
  </div>
</template>
