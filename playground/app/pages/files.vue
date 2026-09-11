<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { isAuthenticated, showAuthedUi } = useAuth()
const { showToast } = useToast()

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

function isImage(contentType: string): boolean {
  return contentType.startsWith('image/')
}
</script>

<template>
  <main class="py-10">
    <h1 class="text-xl font-medium tracking-tight">
      File uploads
    </h1>
    <p class="mt-3 text-sm leading-relaxed text-zinc-500">
      Demo of <code>useConvexFileUpload</code>: generate an upload URL, POST the
      file, then save the <code>storageId</code>. For Cloudflare R2 / large
      objects, see <code>useConvexR2Upload</code> in the README. Sign in on
      <NuxtLink
        to="/"
        class="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
      >
        Live
      </NuxtLink>
      first.
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
          Upload
        </h2>
        <p class="mt-1 text-sm text-zinc-500">
          Auth-gated <code>generateUploadUrl</code> → POST →
          <code>files.save</code>. Progress comes from XHR.
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="file"
            data-testid="file-upload-input"
            class="block w-full max-w-sm text-sm file:mr-3 file:rounded-md file:border file:border-zinc-200 file:bg-white file:px-3 file:py-1.5"
            :disabled="!isAuthenticated || uploading"
            @change="onFileChange"
          >
          <span
            v-if="uploading"
            class="text-sm text-zinc-500"
            data-testid="file-upload-progress"
          >
            Uploading{{ uploadProgress != null ? ` ${Math.round(uploadProgress * 100)}%` : '…' }}
          </span>
        </div>
        <p
          v-if="uploadError"
          class="mt-2 text-sm text-red-600"
          data-testid="file-upload-error"
        >
          {{ uploadError.message }}
        </p>
      </section>

      <section class="mt-6 mb-8 rounded-lg border border-zinc-200 p-4">
        <h2 class="text-sm font-medium">
          Your files
        </h2>
        <p
          v-if="filesPending"
          class="mt-4 text-sm text-zinc-400"
        >
          Loading files…
        </p>
        <ul
          v-else
          class="mt-4 space-y-4 text-sm"
          data-testid="file-list"
        >
          <li
            v-for="file in files ?? []"
            :key="file._id"
            class="border-b border-zinc-100 pb-4 last:border-0 last:pb-0"
          >
            <div class="flex flex-wrap items-start gap-3">
              <a
                v-if="file.url && isImage(file.contentType)"
                :href="file.url"
                target="_blank"
                rel="noopener noreferrer"
                class="block shrink-0"
              >
                <img
                  :src="file.url"
                  :alt="file.name"
                  class="h-16 w-16 rounded-md object-cover"
                >
              </a>
              <div class="min-w-0 flex-1">
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
                <p class="mt-1 text-zinc-400">
                  {{ formatBytes(file.size) }} · {{ file.contentType || 'unknown' }}
                </p>
              </div>
              <button
                type="button"
                class="rounded-md border border-zinc-200 px-2 py-1 text-xs disabled:opacity-50"
                :disabled="!isAuthenticated || (removing && removingId === file._id)"
                @click="onRemoveFile(file._id)"
              >
                {{ removing && removingId === file._id ? 'Removing…' : 'Remove' }}
              </button>
            </div>
          </li>
          <li
            v-if="(files ?? []).length === 0"
            class="text-zinc-400"
          >
            No files yet — pick one above.
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>
