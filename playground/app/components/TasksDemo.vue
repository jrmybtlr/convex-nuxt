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

// Live subscribe only after Convex confirms. SSR stamps isAuthenticated from
// the cookie so the HttpClient snapshot still runs; client uses 'skip' until
// setAuth confirms while the overlay keeps the payload visible.
const queryArgs = computed(() => {
  if (isAuthenticated.value) {
    return {}
  }
  return 'skip' as const
})

const { data, pending, error, refresh } = await useConvexQuery(
  api.tasks.list,
  queryArgs,
)

const { mutate: createTask, pending: creating } = useConvexMutation(
  api.tasks.create,
)
const { mutate: toggleTask, pending: toggling } = useConvexMutation(
  api.tasks.toggle,
)
const { mutate: removeTask, pending: removing } = useConvexMutation(
  api.tasks.remove,
)

const draft = ref('')
const busy = computed(
  () => creating.value || toggling.value || removing.value,
)

async function addTask() {
  const text = draft.value.trim()
  if (!text || !isAuthenticated.value) {
    return
  }
  await createTask({ text })
  draft.value = ''
}

async function onToggle(taskId: Id<'tasks'>) {
  if (!isAuthenticated.value) {
    return
  }
  await toggleTask({ taskId })
}

async function onRemove(taskId: Id<'tasks'>) {
  if (!isAuthenticated.value) {
    return
  }
  await removeTask({ taskId })
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin: 1rem 0">
      <p style="margin: 0; color: #555">
        <span v-if="isLoading && !showAuthedUi">Checking session…</span>
        <span v-else-if="isAuthenticated">Signed in — your tasks sync live.</span>
        <span v-else-if="showAuthedUi">Restoring session…</span>
        <span v-else>Sign in to manage tasks.</span>
      </p>
      <button
        v-if="showAuthedUi"
        type="button"
        :disabled="authPending"
        @click="signOut()"
      >
        Sign out
      </button>
    </div>

    <!-- showAuthedUi keeps SSR HTML mounted while Convex confirms -->
    <template v-if="showAuthedUi">
      <form
        style="display: flex; gap: 0.5rem; margin: 1.5rem 0"
        @submit.prevent="addTask"
      >
        <input
          v-model="draft"
          placeholder="New task"
          style="flex: 1; padding: 0.5rem"
          :disabled="!isAuthenticated || busy"
        >
        <button
          type="submit"
          :disabled="!isAuthenticated || busy"
        >
          {{ creating ? 'Adding…' : 'Add' }}
        </button>
        <button
          type="button"
          :disabled="!isAuthenticated"
          @click="refresh()"
        >
          Refresh
        </button>
      </form>

      <p v-if="pending">
        Loading…
      </p>
      <p v-else-if="error">
        {{ error.message }}
      </p>

      <ul
        v-else
        style="list-style: none; padding: 0; margin: 0"
      >
        <li
          v-for="task in data ?? []"
          :key="task._id"
          style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid #eee"
        >
          <input
            type="checkbox"
            :checked="task.completed"
            :disabled="!isAuthenticated || busy"
            @change="onToggle(task._id)"
          >
          <span :style="{ textDecoration: task.completed ? 'line-through' : 'none', flex: 1 }">
            {{ task.text }}
          </span>
          <button
            type="button"
            :disabled="!isAuthenticated || busy"
            @click="onRemove(task._id)"
          >
            Delete
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>
