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
  <main class="py-10">
    <h1 class="text-xl font-medium tracking-tight">
      Extras
    </h1>
    <p class="mt-3 text-sm leading-relaxed text-zinc-500">
      Demos for <code>live: false</code>, <code>useConvexPaginatedQuery</code>,
      <code>useConvexAction</code>, and <code>useConvexConnectionState</code>.
      Sign in on <NuxtLink to="/" class="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800">Live</NuxtLink> first.
    </p>

    <p
      v-if="!showAuthedUi"
      class="mt-6 text-sm text-zinc-400"
    >
      Not signed in.
    </p>

    <template v-else>
      <section class="mt-8 rounded-lg border border-zinc-200 p-4">
        <h2 class="text-sm font-medium">
          Connection
        </h2>
        <pre class="mt-3 overflow-x-auto rounded-md bg-zinc-50 p-3 text-xs">{{ connection }}</pre>
      </section>

      <section class="mt-6 rounded-lg border border-zinc-200 p-4">
        <h2 class="text-sm font-medium">
          live: false snapshot
        </h2>
        <button
          type="button"
          class="mt-3 rounded-md border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50"
          :disabled="!isAuthenticated"
          @click="refresh()"
        >
          Refresh HttpClient
        </button>
        <p
          v-if="snapshotPending"
          class="mt-3 text-sm text-zinc-400"
        >
          Loading…
        </p>
        <ul
          v-else
          class="mt-3 text-sm"
        >
          <li
            v-for="task in snapshot ?? []"
            :key="task._id"
            class="border-b border-zinc-100 py-2 last:border-0"
          >
            {{ task.text }}
          </li>
        </ul>
      </section>

      <section class="mt-6 rounded-lg border border-zinc-200 p-4">
        <h2 class="text-sm font-medium">
          Paginated list
        </h2>
        <p class="mt-1 text-sm text-zinc-500">
          Status: {{ status }} · {{ results.length }} items
        </p>
        <ul class="mt-3 text-sm">
          <li
            v-for="task in results"
            :key="task._id"
            class="border-b border-zinc-100 py-2 last:border-0"
          >
            {{ task.text }}
          </li>
        </ul>
        <button
          type="button"
          class="mt-3 rounded-md border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50"
          :disabled="status !== 'CanLoadMore' || isLoading"
          @click="loadMore()"
        >
          {{ isLoading ? 'Loading…' : 'Load more' }}
        </button>
      </section>

      <section class="mt-6 mb-8 rounded-lg border border-zinc-200 p-4">
        <h2 class="text-sm font-medium">
          useConvexAction
        </h2>
        <form
          class="mt-4 flex flex-wrap gap-2"
          @submit.prevent="runShout"
        >
          <input
            v-model="shoutInput"
            class="min-w-0 flex-1 rounded-md border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
          >
          <button
            type="submit"
            class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50"
            :disabled="shouting"
          >
            {{ shouting ? 'Running…' : 'Shout' }}
          </button>
        </form>
        <p
          v-if="shoutResult"
          class="mt-3 text-sm"
        >
          {{ shoutResult }}
        </p>
      </section>
    </template>
  </main>
</template>
