<script setup lang="ts">
/**
 * Nitro one-shot demos — contrast with `/` (SSR payload + live WebSocket).
 * Sign in on the Live page first so `convex_jwt` is set for authenticated routes.
 */

type Task = {
  _id: string
  text: string
  completed: boolean
}

const health = ref<{ ok: boolean } | null>(null)
const healthError = ref<string | null>(null)
const tasks = ref<Task[] | null>(null)
const tasksError = ref<string | null>(null)
const tasksPending = ref(false)
const draft = ref('')
const creating = ref(false)

async function loadHealth() {
  healthError.value = null
  try {
    health.value = await $fetch<{ ok: boolean }>('/api/health')
  }
  catch (cause) {
    health.value = null
    healthError.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function loadTasks() {
  tasksPending.value = true
  tasksError.value = null
  try {
    tasks.value = await $fetch<Task[]>('/api/tasks')
  }
  catch (cause: unknown) {
    tasks.value = null
    const err = cause as { statusCode?: number, statusMessage?: string, message?: string }
    if (err?.statusCode === 401) {
      tasksError.value = err.statusMessage
        ?? 'Not signed in — open Live, sign in, then retry.'
    }
    else {
      tasksError.value = err?.statusMessage ?? err?.message ?? String(cause)
    }
  }
  finally {
    tasksPending.value = false
  }
}

async function createTask() {
  const text = draft.value.trim()
  if (!text) {
    return
  }
  creating.value = true
  tasksError.value = null
  try {
    await $fetch('/api/tasks', {
      method: 'POST',
      body: { text },
    })
    draft.value = ''
    await loadTasks()
  }
  catch (cause: unknown) {
    const err = cause as { statusCode?: number, statusMessage?: string, message?: string }
    if (err?.statusCode === 401) {
      tasksError.value = err.statusMessage
        ?? 'Not signed in — open Live, sign in, then retry.'
    }
    else {
      tasksError.value = err?.statusMessage ?? err?.message ?? String(cause)
    }
  }
  finally {
    creating.value = false
  }
}

await loadHealth()
</script>

<template>
  <main style="font-family: system-ui; max-width: 720px; margin: 5rem auto; padding: 0 1rem">
    <h1>Server routes</h1>
    <p style="color: #555">
      These calls go through Nitro
      <code>fetchQuery</code> / <code>fetchMutation</code>
      (fresh HttpClient per request). They are
      <strong>one-shot</strong> — not live. For SSR snapshot + WebSocket overlay,
      use the <NuxtLink to="/">Live</NuxtLink> page.
    </p>

    <section style="margin: 2rem 0; padding: 1rem; border: 1px solid #eee; border-radius: 8px">
      <h2 style="margin-top: 0; font-size: 1.1rem">
        GET /api/health
      </h2>
      <p style="color: #555; font-size: 0.9rem">
        Public query — no cookie. Try
        <code>curl localhost:3000/api/health</code>.
      </p>
      <button
        type="button"
        @click="loadHealth()"
      >
        Refresh
      </button>
      <pre
        v-if="health"
        style="margin-top: 0.75rem; background: #f6f8fa; padding: 0.75rem; border-radius: 6px"
      >{{ health }}</pre>
      <p
        v-if="healthError"
        style="color: #b00020"
      >
        {{ healthError }}
      </p>
    </section>

    <section style="margin: 2rem 0; padding: 1rem; border: 1px solid #eee; border-radius: 8px">
      <h2 style="margin-top: 0; font-size: 1.1rem">
        GET/POST /api/tasks
      </h2>
      <p style="color: #555; font-size: 0.9rem">
        Authenticated via <code>convex_jwt</code> cookie
        (<code>{ event }</code> on the fetch helper). Sign in on Live first.
      </p>

      <form
        style="display: flex; gap: 0.5rem; margin: 1rem 0"
        @submit.prevent="createTask"
      >
        <input
          v-model="draft"
          placeholder="New task via Nitro"
          style="flex: 1; padding: 0.5rem"
        >
        <button
          type="submit"
          :disabled="creating"
        >
          {{ creating ? 'Adding…' : 'POST create' }}
        </button>
        <button
          type="button"
          :disabled="tasksPending"
          @click="loadTasks()"
        >
          {{ tasksPending ? 'Loading…' : 'GET list' }}
        </button>
      </form>

      <p
        v-if="tasksError"
        style="color: #b00020"
      >
        {{ tasksError }}
      </p>

      <ul
        v-if="tasks"
        style="list-style: none; padding: 0; margin: 0"
      >
        <li
          v-for="task in tasks"
          :key="task._id"
          style="padding: 0.4rem 0; border-bottom: 1px solid #eee"
        >
          <span :style="{ textDecoration: task.completed ? 'line-through' : 'none' }">
            {{ task.text }}
          </span>
        </li>
      </ul>
      <p
        v-else-if="!tasksError && !tasksPending"
        style="color: #888"
      >
        Click “GET list” after signing in.
      </p>
    </section>
  </main>
</template>
