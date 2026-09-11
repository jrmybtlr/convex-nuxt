<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { isAuthenticated, showAuthedUi } = useAuth()

// Snapshot-only (no live WebSocket overlay) — useful to compare with Live.
const {
  data: snapshot,
  pending: snapshotPending,
  refresh,
} = await useConvexQuery(api.tasks.list, {}, {
  live: false,
  authenticated: true,
})

const {
  results,
  status,
  isLoading,
  loadMore,
} = await useConvexPaginatedQuery(
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
  }
  catch (cause: unknown) {
    const err = cause as { message?: string }
    showToast(err.message ?? 'Shout failed')
  }
}

const connection = useConvexConnectionState()

const {
  data: files,
  pending: filesPending,
  refresh: refreshFiles,
} = await useConvexQuery(api.files.list, {}, {
  authenticated: true,
})

const {
  upload,
  pending: uploading,
  error: uploadError,
  progress: uploadProgress,
} = useConvexFileUpload({
  generateUploadUrl: api.files.generateUploadUrl,
  saveFile: api.files.save,
})

const { mutate: removeFile, pending: removing } = useConvexMutation(api.files.remove)
const removingId = ref<string | null>(null)

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }
  try {
    await upload(file)
    showToast(`Uploaded ${file.name}`)
    await refreshFiles()
  }
  catch (cause: unknown) {
    const err = cause as { message?: string }
    showToast(err.message ?? uploadError.value?.message ?? 'Upload failed')
  }
  finally {
    input.value = ''
  }
}

async function onRemoveFile(fileId: string) {
  removingId.value = fileId
  try {
    await removeFile({ fileId })
    showToast('File removed')
    await refreshFiles()
  }
  catch (cause: unknown) {
    const err = cause as { message?: string }
    showToast(err.message ?? 'Remove failed')
  }
  finally {
    removingId.value = null
  }
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <main class="py-10">
    <h1 class="text-xl font-medium tracking-tight">
      Extras
    </h1>
    <p class="mt-3 text-sm leading-relaxed text-zinc-500">
      Demos for <code>live: false</code>, <code>useConvexPaginatedQuery</code>,
      <code>useConvexAction</code>, <code>useConvexConnectionState</code>,
      and <code>useConvexFileUpload</code>.
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

      <section class="mt-6 rounded-lg border border-zinc-200 p-4">
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
      </section>

      <section class="mt-6 mb-8 rounded-lg border border-zinc-200 p-4">
        <h2 class="text-sm font-medium">
          useConvexFileUpload
        </h2>
        <p class="mt-1 text-sm text-zinc-500">
          generateUploadUrl → POST file → save storageId (auth required).
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="file"
            class="block w-full max-w-sm text-sm file:mr-3 file:rounded-md file:border file:border-zinc-200 file:bg-white file:px-3 file:py-1.5"
            :disabled="uploading"
            @change="onFileChange"
          >
          <span
            v-if="uploading"
            class="text-sm text-zinc-500"
          >
            Uploading{{ uploadProgress != null ? ` ${Math.round(uploadProgress * 100)}%` : '…' }}
          </span>
        </div>
        <p
          v-if="uploadError"
          class="mt-2 text-sm text-red-600"
        >
          {{ uploadError.message }}
        </p>
        <p
          v-if="filesPending"
          class="mt-4 text-sm text-zinc-400"
        >
          Loading files…
        </p>
        <ul
          v-else
          class="mt-4 space-y-3 text-sm"
        >
          <li
            v-for="file in files ?? []"
            :key="file._id"
            class="flex flex-wrap items-center gap-3 border-b border-zinc-100 py-2 last:border-0"
          >
            <a
              v-if="file.url"
              :href="file.url"
              target="_blank"
              rel="noopener noreferrer"
              class="font-medium underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
            >
              {{ file.name }}
            </a>
            <span
              v-else
              class="font-medium"
            >{{ file.name }}</span>
            <span class="text-zinc-400">{{ formatBytes(file.size) }}</span>
            <span class="text-zinc-400">{{ file.contentType }}</span>
            <button
              type="button"
              class="ml-auto rounded-md border border-zinc-200 px-2 py-1 text-xs disabled:opacity-50"
              :disabled="removing && removingId === file._id"
              @click="onRemoveFile(file._id)"
            >
              {{ removing && removingId === file._id ? 'Removing…' : 'Remove' }}
            </button>
          </li>
          <li
            v-if="(files ?? []).length === 0"
            class="text-zinc-400"
          >
            No files yet.
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>
