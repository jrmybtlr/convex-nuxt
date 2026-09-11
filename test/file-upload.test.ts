import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { makeFunctionReference } from 'convex/server'
import type { ConvexNuxtContext } from '../src/runtime/utils/context'

const generateUploadUrlFn = makeFunctionReference<
  'mutation',
  Record<string, never>,
  string
>('files:generateUploadUrl')

const saveFileFn = makeFunctionReference<
  'mutation',
  {
    storageId: string
    name: string
    contentType: string
    size: number
  },
  string
>('files:save')

function makeCtx(overrides: Partial<ConvexNuxtContext> = {}): ConvexNuxtContext {
  return {
    url: 'https://example.convex.cloud',
    client: {
      mutation: vi.fn(),
      action: vi.fn(),
    } as unknown as ConvexNuxtContext['client'],
    ssrToken: computed(() => undefined),
    auth: {
      configured: false,
      fetchToken: null,
      providerLoading: ref(false),
      providerAuthenticated: ref(false),
      isConvexAuthenticated: ref(null),
      isRefreshingRaw: ref(false),
      isLoading: ref(false),
      isAuthenticated: ref(false),
      isRefreshing: ref(false),
    },
    createHttpClient: vi.fn(),
    ...overrides,
  }
}

function clientMocks(client: ConvexNuxtContext['client']) {
  return client as unknown as {
    mutation: ReturnType<typeof vi.fn>
  }
}

class MockXHR {
  static instances: MockXHR[] = []
  static impl: (xhr: MockXHR) => void = () => {}

  status = 200
  statusText = 'OK'
  response: unknown = { storageId: 'storage-1' }
  responseType = ''
  upload = {
    onprogress: null as ((event: ProgressEvent) => void) | null,
  }

  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  open = vi.fn()
  setRequestHeader = vi.fn()
  send = vi.fn(() => {
    MockXHR.impl(this)
  })

  constructor() {
    MockXHR.instances.push(this)
  }
}

describe('useConvexFileUpload', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('../src/runtime/utils/context')
    MockXHR.instances = []
    MockXHR.impl = (xhr) => {
      queueMicrotask(() => {
        xhr.upload.onprogress?.({
          lengthComputable: true,
          loaded: 50,
          total: 100,
        } as ProgressEvent)
        xhr.onload?.()
      })
    }
    vi.stubGlobal('XMLHttpRequest', MockXHR as unknown as typeof XMLHttpRequest)
  })

  it('uploads via generateUploadUrl → POST → saveFile', async () => {
    const ctx = makeCtx()
    const mutateMock = vi
      .fn()
      .mockResolvedValueOnce('https://upload.example/post')
      .mockResolvedValueOnce('file-1')
    clientMocks(ctx.client).mutation = mutateMock

    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvexFileUpload } = await import(
      '../src/runtime/composables/useConvexFileUpload'
    )
    const { upload, pending, error, progress } = useConvexFileUpload({
      generateUploadUrl: generateUploadUrlFn,
      saveFile: saveFileFn,
    })

    expect(pending.value).toBe(false)
    expect(progress.value).toBeNull()

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    const result = await upload(file)

    expect(result).toBe('file-1')
    expect(error.value).toBeNull()
    expect(pending.value).toBe(false)
    expect(progress.value).toBeNull()

    expect(mutateMock).toHaveBeenNthCalledWith(1, generateUploadUrlFn, {})
    expect(mutateMock).toHaveBeenNthCalledWith(2, saveFileFn, {
      storageId: 'storage-1',
      name: 'hello.txt',
      contentType: 'text/plain',
      size: 5,
    })

    const xhr = MockXHR.instances[0]!
    expect(xhr.open).toHaveBeenCalledWith('POST', 'https://upload.example/post')
    expect(xhr.setRequestHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain',
    )
    expect(xhr.send).toHaveBeenCalledWith(file)
  })

  it('surfaces upload HTTP failures', async () => {
    const ctx = makeCtx()
    clientMocks(ctx.client).mutation = vi
      .fn()
      .mockResolvedValue('https://upload.example/post')

    MockXHR.impl = (xhr) => {
      queueMicrotask(() => {
        xhr.status = 500
        xhr.statusText = 'Server Error'
        xhr.onload?.()
      })
    }

    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvexFileUpload } = await import(
      '../src/runtime/composables/useConvexFileUpload'
    )
    const { upload, error } = useConvexFileUpload({
      generateUploadUrl: generateUploadUrlFn,
      saveFile: saveFileFn,
    })

    const file = new File(['x'], 'x.bin', { type: 'application/octet-stream' })
    await expect(upload(file)).rejects.toThrow(/File upload failed \(500/)
    expect(error.value?.message).toMatch(/File upload failed \(500/)
  })

  it('rejects when there is no browser client', async () => {
    const ctx = makeCtx({ client: null })
    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvexFileUpload } = await import(
      '../src/runtime/composables/useConvexFileUpload'
    )
    const { upload } = useConvexFileUpload({
      generateUploadUrl: generateUploadUrlFn,
      saveFile: saveFileFn,
    })

    const file = new File(['x'], 'x.bin')
    await expect(upload(file)).rejects.toThrow(/only run in the browser/)
  })
})
