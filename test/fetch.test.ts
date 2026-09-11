import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { makeFunctionReference } from 'convex/server'
import type { H3Event } from 'h3'

const { query, mutation, action, createHttpClient } = vi.hoisted(() => {
  const query = vi.fn()
  const mutation = vi.fn()
  const action = vi.fn()
  const createHttpClient = vi.fn(
    (_url: string, _options?: { token?: string; skipConvexDeploymentUrlCheck?: boolean }) => ({
      query,
      mutation,
      action,
    }),
  )
  return { query, mutation, action, createHttpClient }
})

vi.mock('../src/runtime/utils/http', () => ({
  createHttpClient,
}))

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getCookie: vi.fn(),
  }
})

function mockRuntimeConfig(value: { public: { convex: Record<string, unknown> } }) {
  return value as unknown as ReturnType<typeof import('nitropack/runtime').useRuntimeConfig>
}

const listTasks = makeFunctionReference<'query', Record<string, never>, string[]>('tasks:list')
const createTask = makeFunctionReference<'mutation', { text: string }, string>('tasks:create')
const runThing = makeFunctionReference<'action', { n: number }, number>('tasks:run')

describe('fetch resolveUrl / resolveToken', () => {
  beforeEach(() => {
    vi.resetModules()
    createHttpClient.mockClear()
    query.mockReset()
    mutation.mockReset()
    action.mockReset()
    delete process.env.NUXT_PUBLIC_CONVEX_URL
  })

  afterEach(() => {
    delete process.env.NUXT_PUBLIC_CONVEX_URL
  })

  it('prefers options.url', async () => {
    const { resolveUrl } = await import('../src/runtime/server/fetch')
    expect(resolveUrl({ url: 'https://opts.convex.cloud' })).toBe('https://opts.convex.cloud')
  })

  it('falls back to runtimeConfig then env', async () => {
    const { useRuntimeConfig } = await import('nitropack/runtime')
    vi.mocked(useRuntimeConfig).mockReturnValue(
      mockRuntimeConfig({
        public: { convex: { url: 'https://config.convex.cloud' } },
      }),
    )

    const { resolveUrl } = await import('../src/runtime/server/fetch')
    expect(resolveUrl({ event: {} as H3Event })).toBe('https://config.convex.cloud')

    vi.mocked(useRuntimeConfig).mockImplementation(() => {
      throw new Error('no nitro')
    })
    process.env.NUXT_PUBLIC_CONVEX_URL = 'https://env.convex.cloud'
    expect(resolveUrl({})).toBe('https://env.convex.cloud')
  })

  it('throws a clear error when no URL is available', async () => {
    const { useRuntimeConfig } = await import('nitropack/runtime')
    vi.mocked(useRuntimeConfig).mockImplementation(() => {
      throw new Error('no nitro')
    })
    const { resolveUrl } = await import('../src/runtime/server/fetch')
    expect(() => resolveUrl({})).toThrow(/No Convex URL/)
  })

  it('prefers an explicit token over the cookie', async () => {
    const { getCookie } = await import('h3')
    const { useRuntimeConfig } = await import('nitropack/runtime')
    vi.mocked(useRuntimeConfig).mockReturnValue(
      mockRuntimeConfig({
        public: {
          convex: {
            url: 'https://example.convex.cloud',
            auth: { provider: 'convex-auth' },
          },
        },
      }),
    )
    vi.mocked(getCookie).mockReturnValue('from-cookie')

    const { resolveToken } = await import('../src/runtime/server/fetch')
    expect(
      resolveToken({
        token: 'explicit',
        event: {} as H3Event,
      }),
    ).toBe('explicit')
  })

  it('reads the auth cookie when event is passed', async () => {
    const { getCookie } = await import('h3')
    const { useRuntimeConfig } = await import('nitropack/runtime')
    vi.mocked(useRuntimeConfig).mockReturnValue(
      mockRuntimeConfig({
        public: {
          convex: {
            url: 'https://example.convex.cloud',
            auth: { provider: 'convex-auth' },
          },
        },
      }),
    )
    vi.mocked(getCookie).mockReturnValue('from-cookie')

    const { resolveToken } = await import('../src/runtime/server/fetch')
    expect(resolveToken({ event: {} as H3Event })).toBe('from-cookie')
    expect(getCookie).toHaveBeenCalledWith({}, 'convex_jwt')
  })

  it('treats an empty explicit token as undefined', async () => {
    const { resolveToken } = await import('../src/runtime/server/fetch')
    expect(resolveToken({ token: '' })).toBeUndefined()
  })
})

describe('fetchQuery / fetchMutation / fetchAction', () => {
  beforeEach(() => {
    vi.resetModules()
    createHttpClient.mockClear()
    query.mockReset()
    mutation.mockReset()
    action.mockReset()
    query.mockResolvedValue(['ok'])
    mutation.mockResolvedValue('id')
    action.mockResolvedValue(42)
  })

  it('wires HttpClient with resolved URL and token', async () => {
    const { fetchQuery, fetchMutation, fetchAction } = await import('../src/runtime/server/fetch')

    await fetchQuery(
      listTasks,
      {},
      {
        url: 'https://example.convex.cloud',
        token: 'jwt',
        skipConvexDeploymentUrlCheck: true,
      },
    )
    expect(createHttpClient).toHaveBeenCalledWith('https://example.convex.cloud', {
      token: 'jwt',
      skipConvexDeploymentUrlCheck: true,
    })
    expect(query).toHaveBeenCalledWith(listTasks, {})

    await fetchMutation(
      createTask,
      { text: 'hi' },
      {
        url: 'https://example.convex.cloud',
      },
    )
    expect(mutation).toHaveBeenCalledWith(
      createTask,
      { text: 'hi' },
      {
        skipQueue: true,
      },
    )

    await fetchAction(
      runThing,
      { n: 1 },
      {
        url: 'https://example.convex.cloud',
      },
    )
    expect(action).toHaveBeenCalledWith(runThing, { n: 1 })
  })
})
