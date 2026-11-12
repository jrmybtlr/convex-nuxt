import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const { config } = vi.hoisted(() => ({
  config: {
    current: {
      public: {
        convex: {
          url: 'https://example.convex.cloud',
          auth: { cookie: 'convex_jwt' } as Record<string, unknown>,
        },
      },
    },
  },
}))

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    getCookie: vi.fn(),
  }
})

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: vi.fn(() => config.current),
}))

function jwt(expOffsetSeconds: number): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + expOffsetSeconds
  return `${encode({ alg: 'none' })}.${encode({ exp })}.sig`
}

function event(context: Record<string, unknown> = {}) {
  return { context } as never
}

describe('requireConvexAuth / getConvexToken (BYO cookie)', () => {
  beforeEach(() => {
    config.current.public.convex.auth = { cookie: 'convex_jwt' }
  })

  it('returns the JWT when the cookie is present', async () => {
    const { getCookie } = await import('h3')
    vi.mocked(getCookie).mockReturnValue('jwt-token')

    const { getConvexToken, requireConvexAuth } = await import('../src/runtime/server/auth')
    expect(getConvexToken(event())).toBe('jwt-token')
    expect(requireConvexAuth(event())).toBe('jwt-token')
    expect(getCookie).toHaveBeenCalledWith(expect.anything(), 'convex_jwt')
  })

  it('throws 401 when the cookie is missing', async () => {
    const { getCookie } = await import('h3')
    vi.mocked(getCookie).mockReturnValue(undefined)

    const { requireConvexAuth } = await import('../src/runtime/server/auth')
    expect(() => requireConvexAuth(event())).toThrowError()
    try {
      requireConvexAuth(event())
    } catch (e) {
      expect((e as { statusCode?: number }).statusCode).toBe(401)
    }
  })
})

describe('getConvexToken (Convex Auth SSR mode)', () => {
  beforeEach(() => {
    config.current.public.convex.auth = { provider: 'convex-auth' }
  })

  it('prefers the token the session middleware refreshed', async () => {
    const { getCookie } = await import('h3')
    vi.mocked(getCookie).mockReturnValue(jwt(-30))

    const { getConvexToken } = await import('../src/runtime/server/auth')
    expect(getConvexToken(event({ convexAuthToken: 'fresh' }))).toBe('fresh')
    expect(getConvexToken(event({ convexAuthToken: null }))).toBeUndefined()
  })

  it('falls back to a still-valid access-token cookie', async () => {
    const { getCookie } = await import('h3')
    const valid = jwt(60)
    vi.mocked(getCookie).mockReturnValue(valid)

    const { getConvexToken } = await import('../src/runtime/server/auth')
    expect(getConvexToken(event())).toBe(valid)
    expect(getCookie).toHaveBeenCalledWith(expect.anything(), '__convexAuthJWT')
  })

  it('ignores an expired access-token cookie', async () => {
    const { getCookie } = await import('h3')
    vi.mocked(getCookie).mockReturnValue(jwt(-30))

    const { getConvexToken } = await import('../src/runtime/server/auth')
    expect(getConvexToken(event())).toBeUndefined()
  })
})
