import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, ref } from 'vue'
import { useConvexContext } from '../utils/context'

/** Built-in fields the composable always passes into `saveFile`. */
export type ConvexFileUploadMeta = {
  storageId: string
  name: string
  contentType: string
  size: number
}

export type ConvexFileUploadExtraArgs<SaveFile extends FunctionReference<'mutation'>> = Omit<
  FunctionArgs<SaveFile>,
  'storageId' | 'name' | 'contentType' | 'size'
>

export interface UseConvexFileUploadOptions<
  GenerateUploadUrl extends FunctionReference<'mutation'>,
  SaveFile extends FunctionReference<'mutation'>,
> {
  /**
   * Mutation that returns a short-lived Convex upload URL
   * (`ctx.storage.generateUploadUrl()`). Must enforce auth itself.
   */
  generateUploadUrl: GenerateUploadUrl
  /**
   * Mutation that persists `storageId` + file metadata after the POST succeeds.
   * Must accept at least `storageId`, `name`, `contentType`, and `size`.
   */
  saveFile: SaveFile
}

type UploadUrlResult = FunctionReturnType<FunctionReference<'mutation'>>

function isUploadUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function parseStorageId(body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'storageId' in body &&
    typeof (body as { storageId: unknown }).storageId === 'string' &&
    (body as { storageId: string }).storageId.length > 0
  ) {
    return (body as { storageId: string }).storageId
  }
  throw new Error('[use-convex] Upload response missing storageId.')
}

/**
 * POST a file to a Convex-generated upload URL with upload progress.
 * Convex expects `Content-Type` matching the file and returns `{ storageId }`.
 */
export function postFileToUploadUrl(
  uploadUrl: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl)
    xhr.responseType = 'json'
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) {
        return
      }
      if (event.total > 0) {
        onProgress(event.loaded / event.total)
      }
    }

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new Error(
            `[use-convex] File upload failed (${xhr.status} ${xhr.statusText || 'error'}).`,
          ),
        )
        return
      }
      try {
        const body =
          typeof xhr.response === 'string'
            ? (JSON.parse(xhr.response) as unknown)
            : (xhr.response as unknown)
        resolve(parseStorageId(body))
      } catch (cause) {
        const err = cause instanceof Error ? cause : new Error(String(cause))
        reject(err)
      }
    }

    xhr.onerror = () => {
      reject(new Error('[use-convex] File upload network error.'))
    }

    xhr.onabort = () => {
      reject(new Error('[use-convex] File upload aborted.'))
    }

    xhr.send(file)
  })
}

/**
 * Browser helper for Convex's three-step file upload flow:
 * generate upload URL → POST file → save `storageId` via mutation.
 *
 * Returns `{ upload, pending, error, progress }`. `progress` is `0..1` while
 * the bytes are in flight, otherwise `null`.
 *
 * Safe to call during SSR setup — work only runs when `upload()` is invoked
 * in the browser. Your Convex mutations must enforce auth; never expose an
 * unauthenticated `generateUploadUrl`.
 */
export function useConvexFileUpload<
  GenerateUploadUrl extends FunctionReference<'mutation'>,
  SaveFile extends FunctionReference<'mutation'>,
>(options: UseConvexFileUploadOptions<GenerateUploadUrl, SaveFile>) {
  const ctx = useConvexContext()
  const error = ref<Error | null>(null)
  const pendingCount = ref(0)
  const progress = ref<number | null>(null)

  const upload = async (
    file: File,
    extra?: ConvexFileUploadExtraArgs<SaveFile> extends Record<string, never>
      ? undefined
      : ConvexFileUploadExtraArgs<SaveFile>,
  ): Promise<FunctionReturnType<SaveFile>> => {
    if (import.meta.server || !ctx.client) {
      throw new Error('[use-convex] useConvexFileUpload can only run in the browser.')
    }
    if (!(file instanceof File)) {
      throw new TypeError('[use-convex] useConvexFileUpload expects a File.')
    }

    pendingCount.value++
    error.value = null
    progress.value = null

    try {
      const uploadUrl = (await ctx.client.mutation(
        options.generateUploadUrl,
        {} as FunctionArgs<GenerateUploadUrl>,
      )) as UploadUrlResult

      if (!isUploadUrl(uploadUrl)) {
        throw new Error('[use-convex] generateUploadUrl must return a non-empty string URL.')
      }

      const storageId = await postFileToUploadUrl(uploadUrl, file, (fraction) => {
        progress.value = fraction
      })

      progress.value = 1

      const saveArgs = {
        storageId,
        name: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        ...extra,
      } as FunctionArgs<SaveFile>

      return await ctx.client.mutation(options.saveFile, saveArgs)
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
