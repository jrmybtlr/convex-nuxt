<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { isAuthenticated, showAuthedUi } = useAuth()

const queryArgs = computed(() => (isAuthenticated.value ? {} : 'skip' as const))

// Snapshot-only (no live WebSocket overlay) — useful to compare with Live.
const {
  data: snapshot,
  pending: snapshotPending,
  refresh,
} = await useConvexQuery(api.tasks.list, queryArgs, { live: false })

const {
  results,
  status,
  isLoading,
  loadMore,
} = await useConvexPaginatedQuery(
  api.tasks.listPaginated,
  computed(() => (isAuthenticated.value ? {} : 'skip' as const)),
  { initialNumItems: 5 },
)

const { run: shout, pending: shouting } = useConvexAction(api.tasks.shout)
const shoutInput = ref('hello convex')
const shoutResult = ref<string | null>(null)

async function runShout() {
  shoutResult.value = await shout({ text: shoutInput.value })
}

const connection = useConvexConnectionState()
</script>

<template>
  <main style="font-family: system-ui; max-width: 720px; margin: 3rem auto; padding: 0 1rem">
    <h1>Extras</h1>
    <p style="color: #555">
      Demos for <code>live: false</code>, <code>useConvexPaginatedQuery</code>,
      <code>useConvexAction</code>, and <code>useConvexConnectionState</code>.
      Sign in on <NuxtLink to="/">Live</NuxtLink> first.
    </p>

    <p
      v-if="!showAuthedUi"
      style="color: #888"
    >
      Not signed in.
    </p>

    <template v-else>
      <section style="margin: 1.5rem 0; padding: 1rem; border: 1px solid #eee; border-radius: 8px">
        <h2 style="margin-top: 0; font-size: 1.05rem">
          Connection
        </h2>
        <pre style="margin: 0; background: #f6f8fa; padding: 0.75rem; border-radius: 6px; font-size: 0.85rem">{{ connection }}</pre>
      </section>

      <section style="margin: 1.5rem 0; padding: 1rem; border: 1px solid #eee; border-radius: 8px">
        <h2 style="margin-top: 0; font-size: 1.05rem">
          live: false snapshot
        </h2>
        <button
          type="button"
          :disabled="!isAuthenticated"
          @click="refresh()"
        >
          Refresh HttpClient
        </button>
        <p v-if="snapshotPending">
          Loading…
        </p>
        <ul v-else>
          <li
            v-for="task in snapshot ?? []"
            :key="task._id"
          >
            {{ task.text }}
          </li>
        </ul>
      </section>

      <section style="margin: 1.5rem 0; padding: 1rem; border: 1px solid #eee; border-radius: 8px">
        <h2 style="margin-top: 0; font-size: 1.05rem">
          Paginated list
        </h2>
        <p style="color: #555; font-size: 0.9rem">
          Status: {{ status }} · {{ results.length }} items
        </p>
        <ul>
          <li
            v-for="task in results"
            :key="task._id"
          >
            {{ task.text }}
          </li>
        </ul>
        <button
          type="button"
          :disabled="status !== 'CanLoadMore' || isLoading"
          @click="loadMore()"
        >
          {{ isLoading ? 'Loading…' : 'Load more' }}
        </button>
      </section>

      <section style="margin: 1.5rem 0; padding: 1rem; border: 1px solid #eee; border-radius: 8px">
        <h2 style="margin-top: 0; font-size: 1.05rem">
          useConvexAction
        </h2>
        <form
          style="display: flex; gap: 0.5rem"
          @submit.prevent="runShout"
        >
          <input
            v-model="shoutInput"
            style="flex: 1; padding: 0.5rem"
          >
          <button
            type="submit"
            :disabled="shouting"
          >
            {{ shouting ? 'Running…' : 'Shout' }}
          </button>
        </form>
        <p
          v-if="shoutResult"
          style="margin-top: 0.75rem"
        >
          {{ shoutResult }}
        </p>
      </section>
    </template>
  </main>
</template>
