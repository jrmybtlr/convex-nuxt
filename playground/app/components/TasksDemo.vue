<script setup lang="ts">
import type { Id } from '~~/convex/_generated/dataModel'
import { api } from '~~/convex/_generated/api'

const {
  isAuthenticated,
  isLoading,
  showAuthedUi,
  pending: authPending,
  signOut,
} = useAuth()

// `authenticated: true` skips live subscribe until Convex confirms; SSR still
// snapshots via the cookie-stamped isAuthenticated, and the overlay keeps the
// payload visible meanwhile.
const { data, pending, error, refresh } = await useConvexQuery(
  api.tasks.list,
  {},
  { authenticated: true },
)

const { mutate: createTask, pending: creating } = useConvexMutation(api.tasks.create)
const { mutate: toggleTask } = useConvexMutation(api.tasks.toggle)
const { mutate: removeTask } = useConvexMutation(api.tasks.remove)

const draft = ref('')

async function addTask() {
  const text = draft.value.trim()
  if (!text || !isAuthenticated.value) return
  await createTask({ text })
  draft.value = ''
}

async function onToggle(taskId: Id<'tasks'>) {
  if (!isAuthenticated.value) return
  await toggleTask({ taskId })
}

async function onRemove(taskId: Id<'tasks'>) {
  if (!isAuthenticated.value) return
  await removeTask({ taskId })
}
</script>

<template>
  <div>
    <div class="mt-6 flex items-center justify-between gap-4">
      <p class="text-sm text-zinc-500">
        <span v-if="isLoading && !showAuthedUi">Checking session…</span>
        <span v-else-if="isAuthenticated">Signed in — your tasks sync live.</span>
        <span v-else-if="showAuthedUi">Restoring session…</span>
        <span v-else>Sign in to manage tasks.</span>
      </p>
      <button
        v-if="showAuthedUi"
        type="button"
        class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50"
        :disabled="authPending"
        @click="signOut()"
      >
        Sign out
      </button>
    </div>

    <!-- showAuthedUi keeps SSR HTML mounted while Convex confirms -->
    <template v-if="showAuthedUi">
      <form
        class="mt-6 flex flex-wrap gap-2"
        @submit.prevent="addTask"
      >
        <input
          v-model="draft"
          placeholder="New task"
          class="min-w-0 flex-1 rounded-md border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-400 disabled:opacity-50"
          :disabled="!isAuthenticated"
        >
        <button
          type="submit"
          class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50"
          :disabled="!isAuthenticated"
        >
          {{ creating ? 'Adding…' : 'Add' }}
        </button>
        <button
          type="button"
          class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50"
          :disabled="!isAuthenticated"
          @click="refresh()"
        >
          Refresh
        </button>
      </form>

      <p
        v-if="pending"
        class="mt-4 text-sm text-zinc-400"
      >
        Loading…
      </p>
      <p
        v-else-if="error"
        class="mt-4 text-sm text-red-700"
      >
        {{ error.message }}
      </p>

      <ul
        v-else
        class="mt-4"
      >
        <li
          v-for="task in data ?? []"
          :key="task._id"
          class="flex items-center gap-3 border-b border-zinc-100 py-2 text-sm last:border-0"
        >
          <input
            type="checkbox"
            :checked="task.completed"
            :disabled="!isAuthenticated"
            @change="onToggle(task._id)"
          >
          <span
            class="flex-1"
            :class="{ 'text-zinc-400 line-through': task.completed }"
          >
            {{ task.text }}
          </span>
          <button
            type="button"
            class="text-zinc-400 hover:text-zinc-900 disabled:opacity-50"
            :disabled="!isAuthenticated"
            @click="onRemove(task._id)"
          >
            Delete
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>
