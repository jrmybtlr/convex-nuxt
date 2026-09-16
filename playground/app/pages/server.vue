<script setup lang="ts">
useHead({ title: 'Server · use-convex' })

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
const { showToast } = useToast()
const shoutDraft = ref('hello')
const shouting = ref(false)
const shoutResult = ref<{ shouted: string } | null>(null)

async function loadHealth() {
  healthError.value = null
  try {
    health.value = await $fetch<{ ok: boolean }>('/api/health')
  } catch (cause) {
    health.value = null
    healthError.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function loadTasks() {
  tasksPending.value = true
  tasksError.value = null
  try {
    tasks.value = await $fetch<Task[]>('/api/tasks')
  } catch (cause: unknown) {
    tasks.value = null
    const err = cause as { statusCode?: number; statusMessage?: string; message?: string }
    if (err?.statusCode === 401) {
      tasksError.value = err.statusMessage ?? 'Not signed in — open Live, sign in, then retry.'
    } else {
      tasksError.value = err?.statusMessage ?? err?.message ?? String(cause)
    }
  } finally {
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
  } catch (cause: unknown) {
    const err = cause as { statusCode?: number; statusMessage?: string; message?: string }
    if (err?.statusCode === 401) {
      tasksError.value = err.statusMessage ?? 'Not signed in — open Live, sign in, then retry.'
    } else {
      tasksError.value = err?.statusMessage ?? err?.message ?? String(cause)
    }
  } finally {
    creating.value = false
  }
}

async function runShout() {
  const text = shoutDraft.value.trim()
  if (!text) {
    return
  }
  shouting.value = true
  try {
    shoutResult.value = await $fetch<{ shouted: string }>('/api/shout', {
      method: 'POST',
      body: { text },
    })
    showToast(shoutResult.value.shouted)
  } catch (cause: unknown) {
    shoutResult.value = null
    const err = cause as { statusMessage?: string; message?: string }
    const message = err?.statusMessage ?? err?.message ?? String(cause)
    tasksError.value = message
    showToast(message)
  } finally {
    shouting.value = false
  }
}

await loadHealth()
</script>

<template>
  <main class="shell-page">
    <ShellPrompt cmd="./server --nitro" />
    <h1 class="shell-page__title">Server routes</h1>
    <p class="shell-page__lead">
      These calls go through Nitro <code>fetchQuery</code> / <code>fetchMutation</code> /
      <code>fetchAction</code> (fresh HttpClient per request) with
      <code>requireConvexAuth(event)</code> on protected routes. They are
      <strong>one-shot</strong> — not live. For SSR snapshot + WebSocket overlay, use the
      <NuxtLink to="/live">Live</NuxtLink> page.
    </p>

    <section class="shell-panel">
      <h2 class="shell-panel__title">GET /api/health</h2>
      <p class="shell-panel__meta">
        Public query — no cookie. Try <code>curl localhost:3000/api/health</code>.
      </p>
      <div class="shell-row">
        <button type="button" class="shell-btn" @click="loadHealth()">refresh</button>
      </div>
      <pre v-if="health" class="shell-pre">{{ health }}</pre>
      <p v-if="healthError" class="shell-err shell-stack--sm">{{ healthError }}</p>
    </section>

    <section class="shell-panel">
      <h2 class="shell-panel__title">GET/POST /api/tasks</h2>
      <p class="shell-panel__meta">
        Authenticated via the Convex auth cookie (<code>{ event }</code> +
        <code>requireConvexAuth</code>). Sign in on Live first.
      </p>

      <form class="shell-row" @submit.prevent="createTask">
        <input
          v-model="draft"
          placeholder="new task via Nitro"
          class="shell-input shell-input--grow"
        />
        <button type="submit" class="shell-btn" :disabled="creating">
          {{ creating ? '…' : 'POST create' }}
        </button>
        <button type="button" class="shell-btn" :disabled="tasksPending" @click="loadTasks()">
          {{ tasksPending ? '…' : 'GET list' }}
        </button>
      </form>

      <p v-if="tasksError" class="shell-err shell-stack--sm">{{ tasksError }}</p>

      <ul v-if="tasks" class="shell-list">
        <li
          v-for="task in tasks"
          :key="task._id"
          class="shell-list__item"
          :class="{ 'shell-list__item--done': task.completed }"
        >
          {{ task.text }}
        </li>
      </ul>
      <p v-else-if="!tasksError && !tasksPending" class="shell-muted shell-stack--md">
        Click “GET list” after signing in.
      </p>
    </section>

    <section class="shell-panel">
      <h2 class="shell-panel__title">POST /api/shout</h2>
      <p class="shell-panel__meta">
        Authenticated <code>fetchAction</code> demo — sign in on Live first.
      </p>
      <form class="shell-row" @submit.prevent="runShout">
        <input
          v-model="shoutDraft"
          placeholder="text to shout"
          class="shell-input shell-input--grow"
        />
        <button type="submit" class="shell-btn" :disabled="shouting">
          {{ shouting ? '…' : 'POST shout' }}
        </button>
      </form>
      <pre v-if="shoutResult" class="shell-pre">{{ shoutResult }}</pre>
    </section>
  </main>
</template>
