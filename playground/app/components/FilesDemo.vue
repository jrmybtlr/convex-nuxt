<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { isAuthenticated, showAuthedUi } = useAuth()
const { showToast } = useToast()

const {
  data: files,
  pending: filesPending,
  refresh: refreshFiles,
} = await useConvexQuery(
  api.files.list,
  {},
  {
    authenticated: true,
  },
)

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
  } catch (cause: unknown) {
    const err = cause as { message?: string }
    showToast(err.message ?? uploadError.value?.message ?? 'Upload failed')
  } finally {
    input.value = ''
  }
}

async function onRemoveFile(fileId: string) {
  removingId.value = fileId
  try {
    await removeFile({ fileId })
    showToast('File removed')
    await refreshFiles()
  } catch (cause: unknown) {
    const err = cause as { message?: string }
    showToast(err.message ?? 'Remove failed')
  } finally {
    removingId.value = null
  }
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function isImage(contentType: string): boolean {
  return contentType.startsWith('image/')
}
</script>

<template>
  <div>
    <p v-if="!showAuthedUi" class="shell-muted shell-stack">not signed in.</p>

    <template v-else>
      <section class="shell-panel">
        <h2 class="shell-panel__title">upload</h2>
        <p class="shell-panel__meta">
          Auth-gated <code>generateUploadUrl</code> → POST → <code>files.save</code>. Progress comes
          from XHR.
        </p>
        <div class="shell-row shell-row--center">
          <input
            type="file"
            data-testid="file-upload-input"
            class="shell-file"
            :disabled="!isAuthenticated || uploading"
            @change="onFileChange"
          />
          <span v-if="uploading" class="shell-dim" data-testid="file-upload-progress">
            uploading{{ uploadProgress != null ? ` ${Math.round(uploadProgress * 100)}%` : '…' }}
          </span>
        </div>
        <p v-if="uploadError" class="shell-err shell-stack--sm" data-testid="file-upload-error">
          {{ uploadError.message }}
        </p>
      </section>

      <section class="shell-panel">
        <h2 class="shell-panel__title">your files</h2>
        <p v-if="filesPending" class="shell-muted shell-stack--md">loading files…</p>
        <ul v-else class="shell-list" data-testid="file-list">
          <li
            v-for="file in files ?? []"
            :key="file._id"
            class="shell-list__item shell-row--start"
          >
            <a
              v-if="file.url && isImage(file.contentType)"
              :href="file.url"
              target="_blank"
              rel="noopener noreferrer"
              class="shrink-0"
            >
              <img :src="file.url" :alt="file.name" class="shell-thumb" />
            </a>
            <div class="shell-grow">
              <a
                v-if="file.url"
                :href="file.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ file.name }}
              </a>
              <span v-else>{{ file.name }}</span>
              <p class="shell-list__meta">
                {{ formatBytes(file.size) }} · {{ file.contentType || 'unknown' }}
              </p>
            </div>
            <button
              type="button"
              class="shell-btn shell-btn--danger"
              :disabled="!isAuthenticated || (removing && removingId === file._id)"
              @click="onRemoveFile(file._id)"
            >
              {{ removing && removingId === file._id ? '…' : 'remove' }}
            </button>
          </li>
          <li v-if="(files ?? []).length === 0" class="shell-muted">no files yet</li>
        </ul>
      </section>
    </template>
  </div>
</template>
