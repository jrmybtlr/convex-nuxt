import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, ref } from 'vue'
import { useConvexContext } from '../utils/context'

/**
 * Subset of `@convex-dev/r2` `clientApi()` exports needed for client uploads.
 * Pass `api.example` (or any module that re-exports these two mutations).
 */
export type ConvexR2UploadApi = {
  generateUploadUrl: FunctionReference<'mutation'>
  syncMetadata: FunctionReference<'mutation'>
}

export type ConvexR2UploadProgress = {
  loaded: number
  total: number
}

type UploadUrlPayload = {
  url: string
  key: string
}

function parseUploadUrlPayload(value: unknown): UploadUrlPayload {
  if (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    'key' in value &&
    typeof (value as { url: unknown }).url === 'string' &&
    typeof (value as { key: unknown }).key === 'string' &&
    (value as { url: string }).url.length > 0 &&
    (value as { key: string }).key.length > 0
  ) {
    return {
      url: (value as { url: string }).url,
      key: (value as { key: string }).key,
    }
  }
  throw new Error('[use-convex] generateUploadUrl must return `{ url, key }` strings.')
}

/**
 * PUT a file to an R2 signed URL (matches `@convex-dev/r2` client upload).
 */
export function putFileToR2UploadUrl(
  uploadUrl: string,
  file: File,
  onProgress?: (progress: ConvexR2UploadProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

    xhr.upload.onprogress = (event) => {
      if (!onProgress) {
        return
      }
      onProgress({ loaded: event.loaded, total: event.total })
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      reject(
        new Error(`[use-convex] R2 upload failed (${xhr.status} ${xhr.statusText || 'error'}).`),
      )
    }

    xhr.onerror = () => {
      reject(new Error('[use-convex] R2 upload network error.'))
    }

    xhr.onabort = () => {
      reject(new Error('[use-convex] R2 upload aborted.'))
    }

    xhr.send(file)
  })
}

/**
 * Vue counterpart of `@convex-dev/r2/react`'s `useUploadFile`.
 *
 * Expects the object returned by `r2.clientApi()` (at least
 * `generateUploadUrl` + `syncMetadata`). Flow:
 * 1. `generateUploadUrl()` → `{ url, key }`
 * 2. PUT file bytes to the signed URL
 * 3. `syncMetadata({ key })`
 * 4. return `key`
 *
 * Does **not** depend on `@convex-dev/r2` at runtime — only on Convex
 * function references your app exports. Prefer this over built-in
 * `useConvexFileUpload` for large / resumable-oriented object storage.
 */
export function useConvexR2Upload(api: ConvexR2UploadApi) {
  const ctx = useConvexContext()
  const error = ref<Error | null>(null)
  const pendingCount = ref(0)
  const progress = ref<number | null>(null)

  const upload = async (
    file: File,
    options?: {
      onProgress?: (progress: ConvexR2UploadProgress) => void
    },
  ): Promise<string> => {
    if (import.meta.server || !ctx.client) {
      throw new Error('[use-convex] useConvexR2Upload can only run in the browser.')
    }
    if (!(file instanceof File)) {
      throw new TypeError('[use-convex] useConvexR2Upload expects a File.')
    }

    pendingCount.value++
    error.value = null
    progress.value = null

    try {
      const raw = await ctx.client.mutation(
        api.generateUploadUrl,
        {} as FunctionArgs<typeof api.generateUploadUrl>,
      )
      const { url, key } = parseUploadUrlPayload(raw)

      await putFileToR2UploadUrl(url, file, (event) => {
        if (event.total > 0) {
          progress.value = event.loaded / event.total
        }
        options?.onProgress?.(event)
      })

      progress.value = 1

      await ctx.client.mutation(api.syncMetadata, { key } as FunctionArgs<typeof api.syncMetadata>)

      return key
    } catch (cause) {
      const err = cause instanceof Error ? cause : new Error(String(cause))
      error.value = err
      throw err
    } finally {
      pendingCount.value--
      progress.value = null
    }
  }

  return {
    upload,
    error,
    pending: computed(() => pendingCount.value > 0),
    progress: computed(() => progress.value),
  }
}

export type { FunctionReturnType }
