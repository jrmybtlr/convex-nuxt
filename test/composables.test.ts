import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { makeFunctionReference } from 'convex/server'
import type { ConvexNuxtContext } from '../src/runtime/utils/context'

const mutationFn = makeFunctionReference<'mutation', { text: string }, string>(
  'tasks:create',
)
const actionFn = makeFunctionReference<'action', { n: number }, number>(
  'tasks:run',
)

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
    action: ReturnType<typeof vi.fn>
  }
}

describe('useConvexMutation / useConvexAction / useConvex', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('../src/runtime/utils/context')
  })

  it('mutates successfully and tracks pending', async () => {
    const ctx = makeCtx()
    const mutateMock = vi.fn().mockResolvedValue('task-1')
    clientMocks(ctx.client).mutation = mutateMock

    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
      tryUseConvexContext: () => ctx,
    }))

    const { useConvexMutation } = await import(
      '../src/runtime/composables/useConvexMutation'
    )
    const { mutate, error, pending } = useConvexMutation(mutationFn)

    expect(pending.value).toBe(false)
    const result = await mutate({ text: 'hi' })
    expect(result).toBe('task-1')
    expect(mutateMock).toHaveBeenCalledWith(mutationFn, { text: 'hi' }, undefined)
    expect(error.value).toBeNull()
    expect(pending.value).toBe(false)
  })

  it('wraps mutation errors and rethrows', async () => {
    const ctx = makeCtx()
    clientMocks(ctx.client).mutation = vi.fn().mockRejectedValue(new Error('boom'))

    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvexMutation } = await import(
      '../src/runtime/composables/useConvexMutation'
    )
    const { mutate, error } = useConvexMutation(mutationFn)
    await expect(mutate({ text: 'x' })).rejects.toThrow('boom')
    expect(error.value?.message).toBe('boom')
  })

  it('tracks overlapping mutation pending counts', async () => {
    const ctx = makeCtx()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    clientMocks(ctx.client).mutation = vi.fn().mockImplementation(async () => {
      await gate
      return 'ok'
    })

    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvexMutation } = await import(
      '../src/runtime/composables/useConvexMutation'
    )
    const { mutate, pending } = useConvexMutation(mutationFn)
    const first = mutate({ text: 'a' })
    const second = mutate({ text: 'b' })
    expect(pending.value).toBe(true)
    release()
    await Promise.all([first, second])
    expect(pending.value).toBe(false)
  })

  it('passes optimisticUpdate through to ConvexClient.mutation', async () => {
    const ctx = makeCtx()
    const mutateMock = vi.fn().mockResolvedValue('task-1')
    clientMocks(ctx.client).mutation = mutateMock
    const optimisticUpdate = vi.fn()

    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvexMutation } = await import(
      '../src/runtime/composables/useConvexMutation'
    )
    const { mutate } = useConvexMutation(mutationFn, { optimisticUpdate })
    await mutate({ text: 'hi' })
    expect(mutateMock).toHaveBeenCalledWith(mutationFn, { text: 'hi' }, {
      optimisticUpdate,
    })
  })

  it('throws when mutate runs without a client', async () => {
    const ctx = makeCtx({ client: null })
    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvexMutation } = await import(
      '../src/runtime/composables/useConvexMutation'
    )
    const { mutate } = useConvexMutation(mutationFn)
    await expect(mutate({ text: 'x' })).rejects.toThrow(/browser/)
  })

  it('runs actions successfully', async () => {
    const ctx = makeCtx()
    const runMock = vi.fn().mockResolvedValue(7)
    clientMocks(ctx.client).action = runMock

    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvexAction } = await import(
      '../src/runtime/composables/useConvexAction'
    )
    const { run, error } = useConvexAction(actionFn)
    await expect(run({ n: 3 })).resolves.toBe(7)
    expect(runMock).toHaveBeenCalledWith(actionFn, { n: 3 })
    expect(error.value).toBeNull()
  })

  it('returns the browser client from useConvex', async () => {
    const client = { mutation: vi.fn() } as unknown as NonNullable<
      ConvexNuxtContext['client']
    >
    const ctx = makeCtx({ client })
    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvex } = await import('../src/runtime/composables/useConvex')
    expect(useConvex()).toBe(client)
  })

  it('throws from useConvex without a client', async () => {
    const ctx = makeCtx({ client: null })
    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
    }))

    const { useConvex } = await import('../src/runtime/composables/useConvex')
    expect(() => useConvex()).toThrow(/only available in the browser/)
  })
})

describe('useConvexContext', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('../src/runtime/utils/context')
    vi.doUnmock('nuxt/app')
  })

  it('throws when the plugin did not start', async () => {
    vi.doMock('nuxt/app', () => ({
      useNuxtApp: () => ({}),
    }))

    const { useConvexContext, tryUseConvexContext } = await import(
      '../src/runtime/utils/context'
    )
    // Outside Vue setup, inject() typically throws — either path must
    // surface the same "plugin did not start" error from useConvexContext.
    const missing = tryUseConvexContext()
    if (missing) {
      // Unexpected: context somehow resolved. Force the public API path.
      expect(missing).toBeNull()
    }
    expect(() => useConvexContext()).toThrow(/plugin did not start/)
  })
})

describe('prewarmQuery / useAuthToken / useConvexQueries', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('../src/runtime/utils/context')
  })

  it('prewarmQuery subscribes via onUpdate and returns unsubscribe', async () => {
    const unsubscribe = vi.fn()
    const onUpdate = vi.fn(() => unsubscribe)
    const client = { onUpdate } as unknown as NonNullable<ConvexNuxtContext['client']>
    const ctx = makeCtx({ client })
    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
      tryUseConvexContext: () => ctx,
    }))

    const { prewarmQuery } = await import(
      '../src/runtime/composables/prewarmQuery'
    )
    const query = makeFunctionReference<'query', Record<string, never>, string[]>(
      'tasks:list',
    )
    const stop = prewarmQuery(query, {})
    expect(onUpdate).toHaveBeenCalled()
    stop()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('useAuthToken returns null without context', async () => {
    vi.doMock('../src/runtime/utils/context', () => ({
      tryUseConvexContext: () => null,
      useConvexContext: () => {
        throw new Error('no ctx')
      },
    }))
    const { useAuthToken } = await import(
      '../src/runtime/composables/useAuthToken'
    )
    expect(useAuthToken().value).toBeNull()
  })

  it('useAuthToken reads ConvexClient.getAuth()', async () => {
    const client = {
      getAuth: vi.fn(() => ({ token: 'jwt-1', decoded: {} })),
    } as unknown as NonNullable<ConvexNuxtContext['client']>
    const ctx = makeCtx({ client })
    ctx.auth.isAuthenticated.value = true
    vi.doMock('../src/runtime/utils/context', () => ({
      tryUseConvexContext: () => ctx,
      useConvexContext: () => ctx,
    }))
    vi.doMock('nuxt/app', () => ({
      useRuntimeConfig: () => ({ public: { convex: {} } }),
      useCookie: () => ref(undefined),
      navigateTo: vi.fn(),
    }))
    vi.doMock('../src/runtime/composables/useConvexAuth', () => ({
      useConvexAuth: () => ({
        isLoading: computed(() => false),
        isAuthenticated: computed(() => true),
        isRefreshing: computed(() => false),
        hasSsrSession: computed(() => false),
        showAuthedUi: computed(() => true),
      }),
    }))

    const { useAuthToken } = await import(
      '../src/runtime/composables/useAuthToken'
    )
    const token = useAuthToken()
    await Promise.resolve()
    expect(token.value).toBe('jwt-1')
  })

  it('useConvexQueries subscribes per key and skips', async () => {
    const unsubs: Array<ReturnType<typeof vi.fn>> = []
    const onUpdate = vi.fn((_q, _a, onResult) => {
      const unsub = vi.fn()
      unsubs.push(unsub)
      onResult(['ok'])
      return unsub
    })
    const client = { onUpdate } as unknown as NonNullable<ConvexNuxtContext['client']>
    const ctx = makeCtx({ client })
    vi.doMock('../src/runtime/utils/context', () => ({
      useConvexContext: () => ctx,
      tryUseConvexContext: () => ctx,
    }))

    const { useConvexQueries } = await import(
      '../src/runtime/composables/useConvexQueries'
    )
    const query = makeFunctionReference<'query', { id: string }, string[]>(
      'tasks:get',
    )
    const request = ref({
      a: { query, args: { id: '1' } },
      b: 'skip' as const,
    })
    const results = useConvexQueries(request)
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(results.value.a).toEqual(['ok'])
    expect(results.value.b).toBeUndefined()
  })
})
