<script setup lang="ts">

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
  }
  catch (cause: unknown) {
    shoutResult.value = null
    const err = cause as { statusMessage?: string, message?: string }
    const message = err?.statusMessage ?? err?.message ?? String(cause)
    tasksError.value = message
    showToast(message)
  }
  finally {
    shouting.value = false
  }
}

await loadHealth()
</script>

<template>
  <main class="py-10">
    <h1 class="text-xl font-medium tracking-tight">
      Server routes
    </h1>
    <p class="mt-3 text-sm leading-relaxed text-zinc-500">
      These calls go through Nitro
      <code>fetchQuery</code> / <code>fetchMutation</code> /
      <code>fetchAction</code>
      (fresh HttpClient per request) with
      <code>requireConvexAuth(event)</code> on protected routes. They are
      <strong>one-shot</strong> — not live. For SSR snapshot + WebSocket overlay,
      use the <NuxtLink to="/" class="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800">Live</NuxtLink> page.
    </p>

    <section class="mt-8 rounded-lg border border-zinc-200 p-4">
      <h2 class="text-sm font-medium">
        GET /api/health
      </h2>
      <p class="mt-1 text-sm text-zinc-500">
        Public query — no cookie. Try
        <code>curl localhost:3000/api/health</code>.
      </p>
      <button
        type="button"
        class="mt-3 rounded-md border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50"
        @click="loadHealth()"
      >
        Refresh
      </button>
      <pre
        v-if="health"
        class="mt-3 overflow-x-auto rounded-md bg-zinc-50 p-3 text-xs"
      >{{ health }}</pre>
      <p
        v-if="healthError"
        class="mt-2 text-sm text-red-700"
      >
        {{ healthError }}
      </p>
    </section>

    <section class="mt-6 rounded-lg border border-zinc-200 p-4">
      <h2 class="text-sm font-medium">
        GET/POST /api/tasks
      </h2>
      <p class="mt-1 text-sm text-zinc-500">
        Authenticated via the Convex auth cookie
        (<code>{ event }</code> + <code>requireConvexAuth</code>). Sign in on Live first.
      </p>

      <form
        class="mt-4 flex flex-wrap gap-2"
        @submit.prevent="createTask"
      >
        <input
          v-model="draft"
          placeholder="New task via Nitro"
          class="min-w-0 flex-1 rounded-md border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
        >
        <button
          type="submit"
          class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50"
          :disabled="creating"
        >
          {{ creating ? 'Adding…' : 'POST create' }}
        </button>
        <button
          type="button"
          class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50"
          :disabled="tasksPending"
          @click="loadTasks()"
        >
          {{ tasksPending ? 'Loading…' : 'GET list' }}
        </button>
      </form>

      <p
        v-if="tasksError"
        class="mt-2 text-sm text-red-700"
      >
        {{ tasksError }}
      </p>

      <ul
        v-if="tasks"
        class="mt-3"
      >
        <li
          v-for="task in tasks"
          :key="task._id"
          class="border-b border-zinc-100 py-2 text-sm last:border-0"
          :class="{ 'text-zinc-400 line-through': task.completed }"
        >
          {{ task.text }}
        </li>
      </ul>
      <p
        v-else-if="!tasksError && !tasksPending"
        class="mt-3 text-sm text-zinc-400"
      >
        Click “GET list” after signing in.
      </p>
    </section>

    <section class="mt-6 mb-8 rounded-lg border border-zinc-200 p-4">
      <h2 class="text-sm font-medium">
        POST /api/shout
      </h2>
      <p class="mt-1 text-sm text-zinc-500">
        Public <code>fetchAction</code> demo — no cookie required.
      </p>
      <form
        class="mt-4 flex flex-wrap gap-2"
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
          {{ shouting ? '…' : 'POST shout' }}
        </button>
      </form>
      <pre
        v-if="shoutResult"
        class="mt-3 overflow-x-auto rounded-md bg-zinc-50 p-3 text-xs"
      >{{ shoutResult }}</pre>
    </section>
  </main>
</template>
