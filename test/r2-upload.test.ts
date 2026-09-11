import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { computed, ref } from 'vue'
import { makeFunctionReference } from 'convex/server'
import type { ConvexNuxtContext } from '../src/runtime/utils/context'

const generateUploadUrlFn = makeFunctionReference<
  'mutation',
  Record<string, never>,
  { url: string; key: string }
>('r2:generateUploadUrl')

const syncMetadataFn = makeFunctionReference<'mutation', { key: string }, null>('r2:syncMetadata')

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

describe('useConvexR2Upload', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('../src/runtime/utils/context')
    MockXHR.instances = []
    MockXHR.impl = (xhr) => {
      queueMicrotask(() => {
        xhr.upload.onprogress?.({
          lengthComputable: true,
          loaded: 40,
          total: 80,
        } as ProgressEvent)
        xhr.onload?.()
      })
    }
    vi.stubGlobal('XMLHttpRequest', MockXHR as unknown as typeof XMLHttpRequest)
  })

  it('uploads via generateUploadUrl → PUT → syncMetadata', async () => {
    const ctx = makeCtx()
    const mutateMock = vi
      .fn()
      .mockResolvedValueOnce({
        url: 'https://r2.example/signed',
        key: 'uploads/abc',
      })
      .mockResolvedValueOnce(null)
    clientMocks(ctx.client).mutation = mutateMock

    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvexR2Upload } = await import('../src/runtime/composables/useConvexR2Upload')
    const { upload, pending, error, progress } = useConvexR2Upload({
      generateUploadUrl: generateUploadUrlFn,
      syncMetadata: syncMetadataFn,
    })

    expect(pending.value).toBe(false)
    expect(progress.value).toBeNull()

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    const key = await upload(file)

    expect(key).toBe('uploads/abc')
    expect(error.value).toBeNull()
    expect(pending.value).toBe(false)
    expect(progress.value).toBeNull()

    expect(mutateMock).toHaveBeenNthCalledWith(1, generateUploadUrlFn, {})
    expect(mutateMock).toHaveBeenNthCalledWith(2, syncMetadataFn, {
      key: 'uploads/abc',
    })

    const xhr = MockXHR.instances[0]!
    expect(xhr.open).toHaveBeenCalledWith('PUT', 'https://r2.example/signed')
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'text/plain')
    expect(xhr.send).toHaveBeenCalledWith(file)
  })

  it('surfaces PUT failures', async () => {
    const ctx = makeCtx()
    clientMocks(ctx.client).mutation = vi.fn().mockResolvedValue({
      url: 'https://r2.example/signed',
      key: 'k1',
    })

    MockXHR.impl = (xhr) => {
      queueMicrotask(() => {
        xhr.status = 403
        xhr.statusText = 'Forbidden'
        xhr.onload?.()
      })
    }

    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvexR2Upload } = await import('../src/runtime/composables/useConvexR2Upload')
    const { upload, error } = useConvexR2Upload({
      generateUploadUrl: generateUploadUrlFn,
      syncMetadata: syncMetadataFn,
    })

    const file = new File(['x'], 'x.bin', { type: 'application/octet-stream' })
    await expect(upload(file)).rejects.toThrow(/R2 upload failed \(403/)
    expect(error.value?.message).toMatch(/R2 upload failed \(403/)
  })

  it('rejects when there is no browser client', async () => {
    const ctx = makeCtx({ client: null })
    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvexR2Upload } = await import('../src/runtime/composables/useConvexR2Upload')
    const { upload } = useConvexR2Upload({
      generateUploadUrl: generateUploadUrlFn,
      syncMetadata: syncMetadataFn,
    })

    await expect(upload(new File(['x'], 'x.bin'))).rejects.toThrow(/only run in the browser/)
  })

  it('rejects malformed generateUploadUrl payloads', async () => {
    const ctx = makeCtx()
    clientMocks(ctx.client).mutation = vi.fn().mockResolvedValue({ url: 'only-url' })

    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvexR2Upload } = await import('../src/runtime/composables/useConvexR2Upload')
    const { upload } = useConvexR2Upload({
      generateUploadUrl: generateUploadUrlFn,
      syncMetadata: syncMetadataFn,
    })

    await expect(upload(new File(['x'], 'x.bin'))).rejects.toThrow(/must return `\{ url, key \}`/)
  })
})
