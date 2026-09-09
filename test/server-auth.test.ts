import { describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    getCookie: vi.fn(),
    createError: actual.createError,
  }
})

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: vi.fn(() => ({
    public: {
      convex: {
        url: 'https://example.convex.cloud',
        auth: { provider: 'convex-auth', cookie: 'convex_jwt' },
      },
    },
  })),
}))

describe('requireConvexAuth / getConvexToken', () => {
  it('returns the JWT when the cookie is present', async () => {
    const { getCookie } = await import('h3')
    vi.mocked(getCookie).mockReturnValue('jwt-token')

    const { getConvexToken, requireConvexAuth } = await import(
      '../src/runtime/server/auth'
    )
    const event = {} as never
    expect(getConvexToken(event)).toBe('jwt-token')
    expect(requireConvexAuth(event)).toBe('jwt-token')
  })

  it('throws 401 when the cookie is missing', async () => {
    const { getCookie } = await import('h3')
    vi.mocked(getCookie).mockReturnValue(undefined)

    const { requireConvexAuth } = await import('../src/runtime/server/auth')
    expect(() => requireConvexAuth({} as never)).toThrowError()
    try {
      requireConvexAuth({} as never)
    }
    catch (e) {
      expect(createError).toBeTruthy()
      expect((e as { statusCode?: number }).statusCode).toBe(401)
    }
  })
})
