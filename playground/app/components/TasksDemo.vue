<script setup lang="ts">
import type { Id } from '~~/convex/_generated/dataModel'
import { api } from '~~/convex/_generated/api'

const { isAuthenticated, isLoading, showAuthedUi, pending: authPending, signOut } = useAuth()

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
    <div class="shell-row shell-row--between shell-row--flush">
      <p class="shell-dim">
        <span v-if="isLoading && !showAuthedUi">checking session…</span>
        <span v-else-if="isAuthenticated">signed in — tasks sync live</span>
        <span v-else-if="showAuthedUi">restoring session…</span>
        <span v-else>sign in to manage tasks</span>
      </p>
      <button
        v-if="showAuthedUi"
        type="button"
        class="shell-btn"
        :disabled="authPending"
        @click="signOut()"
      >
        sign out
      </button>
    </div>

    <!-- showAuthedUi keeps SSR HTML mounted while Convex confirms -->
    <template v-if="showAuthedUi">
      <section class="shell-panel">
        <h2 class="shell-panel__title">tasks</h2>
        <p class="shell-panel__meta">useConvexQuery + useConvexMutation</p>
        <form class="shell-row" @submit.prevent="addTask">
          <input
            v-model="draft"
            placeholder="new task"
            class="shell-input shell-input--grow"
            :disabled="!isAuthenticated"
          />
          <button type="submit" class="shell-btn" :disabled="!isAuthenticated">
            {{ creating ? '…' : 'add' }}
          </button>
          <button
            type="button"
            class="shell-btn"
            :disabled="!isAuthenticated"
            @click="refresh()"
          >
            refresh
          </button>
        </form>

        <p v-if="pending" class="shell-muted shell-stack--md">loading…</p>
        <p v-else-if="error" class="shell-err shell-stack--md">
          {{ error.message }}
        </p>

        <ul v-else class="shell-list">
          <li
            v-for="task in data ?? []"
            :key="task._id"
            class="shell-list__item"
            :class="{ 'shell-list__item--done': task.completed }"
          >
            <input
              type="checkbox"
              class="shell-check"
              :checked="task.completed"
              :disabled="!isAuthenticated"
              @change="onToggle(task._id)"
            />
            <span class="shell-grow">{{ task.text }}</span>
            <button
              type="button"
              class="shell-btn shell-btn--danger"
              :disabled="!isAuthenticated"
              @click="onRemove(task._id)"
            >
              delete
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
