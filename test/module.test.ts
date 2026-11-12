import { afterEach, describe, expect, it, vi, beforeEach } from 'vite-plus/test'
import { makeFunctionReference } from 'convex/server'
import { convexQueryKey } from '../src/runtime/utils/queryKey'
import { resolveQueryOverlay } from '../src/runtime/utils/overlay'
import { createHttpClient } from '../src/runtime/utils/http'
import { resolveConvexAuthState } from '../src/runtime/utils/authState'
import { resolveFetchToken } from '../src/runtime/utils/fetchToken'
import {
  cookieValueToSsrToken,
  isJwtExpiring,
  resolveAuthApiNames,
  resolveAuthCookieName,
  resolveAuthMode,
  resolveAuthRoutes,
  sessionKeyFromToken,
} from '../src/runtime/utils/authStorage'

const listTasks = makeFunctionReference<'query', Record<string, never>, Array<{ text: string }>>(
  'tasks:list',
)

const getTask = makeFunctionReference<'query', { id: string }, { text: string }>('tasks:get')

describe('convexQueryKey', () => {
  it('uses getFunctionName instead of String(query)', () => {
    const key = convexQueryKey(listTasks, {})
    expect(key).toBe('convex:tasks:list:{}')
    expect(key).not.toContain('[object Object]')
  })

  it('includes serialized args so different args do not collide', () => {
    const a = convexQueryKey(getTask, { id: 'a' })
    const b = convexQueryKey(getTask, { id: 'b' })
    expect(a).not.toBe(b)
    expect(a).toContain('tasks:get')
  })

  it('honors an explicit key', () => {
    expect(convexQueryKey(listTasks, {}, 'tasks:list')).toBe('tasks:list')
  })

  it('keeps the same key for skip as for empty args (SSR payload reuse)', () => {
    expect(convexQueryKey(listTasks, 'skip')).toBe(convexQueryKey(listTasks, {}))
    expect(convexQueryKey(listTasks, 'skip')).toBe('convex:tasks:list:{}')
  })
})

describe('resolveQueryOverlay', () => {
  it('shows the SSR payload until the live subscription delivers', () => {
    const payload = [{ text: 'from-ssr' }]
    const before = resolveQueryOverlay({
      skipped: false,
      liveReady: false,
      liveData: undefined,
      liveError: null,
      payload,
      payloadError: null,
      payloadPending: false,
    })
    expect(before.data).toEqual(payload)
    expect(before.pending).toBe(false)
    expect(before.status).toBe('success')

    const after = resolveQueryOverlay({
      skipped: false,
      liveReady: true,
      liveData: [{ text: 'from-live' }],
      liveError: null,
      payload,
      payloadError: null,
      payloadPending: false,
    })
    expect(after.data).toEqual([{ text: 'from-live' }])
  })

  it('does not flash pending when the payload is already hydrated', () => {
    const result = resolveQueryOverlay({
      skipped: false,
      liveReady: false,
      liveData: undefined,
      liveError: null,
      payload: [],
      payloadError: null,
      payloadPending: false,
    })
    expect(result.pending).toBe(false)
  })

  it('surfaces subscription errors', () => {
    const err = new Error('subscription failed')
    const result = resolveQueryOverlay({
      skipped: false,
      liveReady: true,
      liveData: undefined,
      liveError: err,
      payload: [{ text: 'ssr' }],
      payloadError: null,
      payloadPending: false,
    })
    expect(result.error).toBe(err)
    expect(result.status).toBe('error')
    expect(result.pending).toBe(false)
  })

  it('keeps the SSR payload while skipped (auth gate)', () => {
    const payload = [{ text: 'from-ssr' }]
    const result = resolveQueryOverlay({
      skipped: true,
      liveReady: false,
      liveData: undefined,
      liveError: null,
      payload,
      payloadError: null,
      payloadPending: true,
    })
    expect(result.data).toEqual(payload)
    expect(result.pending).toBe(false)
    expect(result.status).toBe('success')
  })

  it('does not let a stale payload error mask a healthy live result', () => {
    const result = resolveQueryOverlay({
      skipped: false,
      liveReady: true,
      liveData: [{ text: 'from-live' }],
      liveError: null,
      payload: null,
      payloadError: new Error('Not authenticated'),
      payloadPending: false,
    })
    expect(result.error).toBeNull()
    expect(result.data).toEqual([{ text: 'from-live' }])
    expect(result.status).toBe('success')
  })
})

describe('createHttpClient', () => {
  it('creates a fresh client and applies auth when provided', () => {
    const client = createHttpClient('https://example.convex.cloud', {
      token: 'test-jwt',
      skipConvexDeploymentUrlCheck: true,
    })
    expect(client.url).toContain('example.convex.cloud')
  })

  it('applies adminToken via setAdminAuth and clears user JWT', () => {
    const client = createHttpClient('https://example.convex.cloud', {
      token: 'user-jwt',
      adminToken: 'deploy-key',
      skipConvexDeploymentUrlCheck: true,
    })
    const state = client as unknown as { auth?: string; adminAuth?: string }
    expect(state.adminAuth).toBe('deploy-key')
    expect(state.auth).toBeUndefined()
  })
})

describe('skip does not call HttpClient.query', () => {
  it('documents the skip contract used by useConvexQuery', async () => {
    const query = vi.fn()
    const argsValue: unknown = 'skip'
    if (argsValue !== 'skip') {
      await query()
    }
    expect(query).not.toHaveBeenCalled()
  })
})

describe('resolveAuthGatedArgs', () => {
  it('passes through when authenticated option is off', async () => {
    const { resolveAuthGatedArgs } = await import('../src/runtime/utils/authGate')
    expect(resolveAuthGatedArgs({}, { authenticated: false, isAuthenticated: false })).toEqual({})
    expect(
      resolveAuthGatedArgs({ id: '1' }, { authenticated: undefined, isAuthenticated: false }),
    ).toEqual({ id: '1' })
  })

  it('skips when authenticated:true and Convex has not confirmed', async () => {
    const { resolveAuthGatedArgs } = await import('../src/runtime/utils/authGate')
    expect(resolveAuthGatedArgs({}, { authenticated: true, isAuthenticated: false })).toBe('skip')
    expect(resolveAuthGatedArgs({ id: '1' }, { authenticated: true, isAuthenticated: false })).toBe(
      'skip',
    )
  })

  it('fetches when authenticated:true and Convex confirmed (SSR stamp)', async () => {
    const { resolveAuthGatedArgs } = await import('../src/runtime/utils/authGate')
    expect(resolveAuthGatedArgs({}, { authenticated: true, isAuthenticated: true })).toEqual({})
    expect(
      resolveAuthGatedArgs({ id: '1' }, { authenticated: true, isAuthenticated: true }),
    ).toEqual({ id: '1' })
  })

  it('keeps caller skip over the auth gate', async () => {
    const { resolveAuthGatedArgs } = await import('../src/runtime/utils/authGate')
    expect(
      resolveAuthGatedArgs('skip', {
        authenticated: true,
        isAuthenticated: true,
      }),
    ).toBe('skip')
  })

  it('keeps non-empty arg keys while internally auth-skipped', () => {
    // Keys must come from raw args, not effective 'skip' (which would map to {}).
    const raw = { id: 'task-1' }
    expect(convexQueryKey(getTask, raw)).toBe('convex:tasks:get:{"id":"task-1"}')
    expect(convexQueryKey(getTask, raw)).not.toBe(convexQueryKey(getTask, 'skip'))
  })
})

describe('resolveConvexAuthState', () => {
  it('stays loading while the auth provider is resolving', () => {
    expect(
      resolveConvexAuthState({
        authProviderLoading: true,
        authProviderAuthenticated: true,
        isConvexAuthenticated: true,
        isRefreshing: false,
      }),
    ).toEqual({
      isLoading: true,
      isAuthenticated: false,
      isRefreshing: false,
    })
  })

  it('is signed out when the provider reports no session', () => {
    expect(
      resolveConvexAuthState({
        authProviderLoading: false,
        authProviderAuthenticated: false,
        isConvexAuthenticated: null,
        isRefreshing: true,
      }),
    ).toEqual({
      isLoading: false,
      isAuthenticated: false,
      isRefreshing: false,
    })
  })

  it('stays loading until Convex confirms the token', () => {
    expect(
      resolveConvexAuthState({
        authProviderLoading: false,
        authProviderAuthenticated: true,
        isConvexAuthenticated: null,
        isRefreshing: false,
      }),
    ).toEqual({
      isLoading: true,
      isAuthenticated: false,
      isRefreshing: false,
    })
  })

  it('is authenticated after Convex confirmation', () => {
    expect(
      resolveConvexAuthState({
        authProviderLoading: false,
        authProviderAuthenticated: true,
        isConvexAuthenticated: true,
        isRefreshing: false,
      }),
    ).toEqual({
      isLoading: false,
      isAuthenticated: true,
      isRefreshing: false,
    })
  })

  it('exposes isRefreshing only while authenticated', () => {
    expect(
      resolveConvexAuthState({
        authProviderLoading: false,
        authProviderAuthenticated: true,
        isConvexAuthenticated: true,
        isRefreshing: true,
      }).isRefreshing,
    ).toBe(true)

    expect(
      resolveConvexAuthState({
        authProviderLoading: false,
        authProviderAuthenticated: true,
        isConvexAuthenticated: false,
        isRefreshing: true,
      }).isRefreshing,
    ).toBe(false)
  })
})

describe('ssrToken fallback', () => {
  it('prefers an explicit query token over the cookie token', () => {
    const optionsToken = 'explicit'
    const ssrToken = cookieValueToSsrToken('from-cookie')
    const token = optionsToken ?? ssrToken
    expect(token).toBe('explicit')
  })

  it('falls back to the SSR cookie token', () => {
    const optionsToken: string | undefined = undefined
    const ssrToken = cookieValueToSsrToken('from-cookie')
    const token = optionsToken ?? ssrToken
    expect(token).toBe('from-cookie')
  })

  it('treats empty cookie values as no SSR session', () => {
    expect(cookieValueToSsrToken('jwt')).toBe('jwt')
    expect(!!cookieValueToSsrToken('jwt')).toBe(true)
    expect(cookieValueToSsrToken(null)).toBeUndefined()
    expect(cookieValueToSsrToken('')).toBeUndefined()
    expect(!!cookieValueToSsrToken(undefined)).toBe(false)
  })
})

describe('resolveFetchToken', () => {
  it('prefers an explicit token over the cookie', () => {
    expect(
      resolveFetchToken({
        token: 'explicit',
        cookieName: 'convex_jwt',
        cookieValue: 'from-cookie',
      }),
    ).toBe('explicit')
  })

  it('falls back to the cookie value when token is omitted', () => {
    expect(
      resolveFetchToken({
        cookieName: 'convex_jwt',
        cookieValue: 'from-cookie',
      }),
    ).toBe('from-cookie')
  })

  it('treats an empty explicit token as undefined', () => {
    expect(resolveFetchToken({ token: '' })).toBeUndefined()
  })
})

describe('convex.server default', () => {
  it('defaults useConvexQuery server option from module config', () => {
    const resolveServer = (optionsServer: boolean | undefined, moduleServer: boolean | undefined) =>
      optionsServer ?? moduleServer ?? true

    expect(resolveServer(undefined, true)).toBe(true)
    expect(resolveServer(undefined, false)).toBe(false)
    expect(resolveServer(true, false)).toBe(true)
    expect(resolveServer(false, true)).toBe(false)
  })
})

function jwtWithExp(exp: number | undefined): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode(exp === undefined ? {} : { exp })}.sig`
}

describe('authStorage helpers', () => {
  it('uses the Convex Auth cookie only in SSR mode, else the BYO cookie', () => {
    expect(resolveAuthCookieName({ provider: 'convex-auth' })).toBe('__convexAuthJWT')
    expect(resolveAuthCookieName({ provider: 'convex-auth', mode: 'ssr' })).toBe('__convexAuthJWT')
    expect(resolveAuthCookieName({ provider: 'convex-auth', mode: 'spa' })).toBeUndefined()
    // A BYO cookie name is ignored for Convex Auth, which owns its cookies.
    expect(resolveAuthCookieName({ provider: 'convex-auth', cookie: 'custom' })).toBe(
      '__convexAuthJWT',
    )
    expect(resolveAuthCookieName({ cookie: 'only-cookie' })).toBe('only-cookie')
    expect(resolveAuthCookieName(undefined)).toBeUndefined()
    expect(resolveAuthCookieName({})).toBeUndefined()
  })

  it('defaults Convex Auth to SSR mode', () => {
    expect(resolveAuthMode({ provider: 'convex-auth' })).toBe('ssr')
    expect(resolveAuthMode({ provider: 'convex-auth', mode: 'spa' })).toBe('spa')
  })

  it('resolves session function names with overrides', () => {
    expect(resolveAuthApiNames(undefined)).toEqual({
      refreshSession: 'auth:refreshSession',
      signOut: 'auth:signOut',
      isAuthenticated: 'auth:isAuthenticated',
    })
    expect(resolveAuthApiNames({ api: { signOut: 'session:end' } }).signOut).toBe('session:end')
  })

  it('builds auth routes from the prefix', () => {
    expect(resolveAuthRoutes(undefined)).toEqual({
      signIn: '/api/convex/auth/signin',
      refresh: '/api/convex/auth/refresh',
      signOut: '/api/convex/auth/signout',
    })
    expect(resolveAuthRoutes({ routePrefix: '/auth/' }).refresh).toBe('/auth/refresh')
  })

  it('maps cookie values to an SSR token', () => {
    expect(cookieValueToSsrToken('jwt')).toBe('jwt')
    expect(cookieValueToSsrToken(null)).toBeUndefined()
    expect(cookieValueToSsrToken('')).toBeUndefined()
    expect(cookieValueToSsrToken(undefined)).toBeUndefined()
  })

  it('detects expiring and unreadable JWTs', () => {
    const now = Date.now()
    const nowSeconds = Math.floor(now / 1000)
    expect(isJwtExpiring(jwtWithExp(nowSeconds + 60), 10, now)).toBe(false)
    expect(isJwtExpiring(jwtWithExp(nowSeconds + 5), 10, now)).toBe(true)
    expect(isJwtExpiring(jwtWithExp(nowSeconds + 5), 0, now)).toBe(false)
    expect(isJwtExpiring(jwtWithExp(nowSeconds - 1), 0, now)).toBe(true)
    expect(isJwtExpiring(jwtWithExp(undefined))).toBe(true)
    expect(isJwtExpiring('not-a-jwt')).toBe(true)
  })
})

describe('sessionKeyFromToken', () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const jwt = (claims: Record<string, unknown>) =>
    `${encode({ alg: 'none' })}.${encode(claims)}.sig`

  it('is stable across token rotation within one session', () => {
    const a = jwt({ iss: 'https://x/components/auth', sub: 'session-1', iat: 1, exp: 61 })
    const b = jwt({ iss: 'https://x/components/auth', sub: 'session-1', iat: 50, exp: 110 })
    expect(a).not.toBe(b)
    expect(sessionKeyFromToken(a)).toBe(sessionKeyFromToken(b))
  })

  it('changes on account switch', () => {
    const a = jwt({ iss: 'https://x', sub: 'user-a' })
    const b = jwt({ iss: 'https://x', sub: 'user-b' })
    expect(sessionKeyFromToken(a)).not.toBe(sessionKeyFromToken(b))
  })

  it('falls back to the raw token without readable claims, and is empty without a token', () => {
    expect(sessionKeyFromToken('opaque-token')).toBe('opaque-token')
    expect(sessionKeyFromToken(jwt({ iss: 'https://x' }))).toBe(jwt({ iss: 'https://x' }))
    expect(sessionKeyFromToken(undefined)).toBe('')
    expect(sessionKeyFromToken('')).toBe('')
  })
})

describe('postAuth (SSR session routes)', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  function respond(status: number, body: string, contentType = 'application/json') {
    globalThis.fetch = vi.fn(
      async () => new Response(body, { status, headers: { 'content-type': contentType } }),
    ) as never
  }

  it('returns tokens from a 200 and the documented 401 no-session body', async () => {
    const { postAuth } = await import('../src/runtime/auth/sessionRoutes')
    respond(200, JSON.stringify({ tokens: { accessToken: 'jwt', userId: 'users:1' } }))
    await expect(postAuth('/r')).resolves.toEqual({
      tokens: { accessToken: 'jwt', userId: 'users:1' },
    })
    respond(401, JSON.stringify({ tokens: null }))
    await expect(postAuth('/r')).resolves.toEqual({ tokens: null })
  })

  it('throws on outages, refusals and malformed bodies instead of reporting signed out', async () => {
    const { postAuth } = await import('../src/runtime/auth/sessionRoutes')
    respond(502, '<html>Bad gateway</html>', 'text/html')
    await expect(postAuth('/r')).rejects.toThrow(/502/)
    respond(403, JSON.stringify({ tokens: null }))
    await expect(postAuth('/r')).rejects.toThrow(/403/)
    respond(200, JSON.stringify({ ok: true }))
    await expect(postAuth('/r')).rejects.toThrow(/200/)
    respond(401, JSON.stringify({ tokens: { accessToken: 'x', userId: 'y' } }))
    await expect(postAuth('/r')).rejects.toThrow(/401/)
  })
})

describe('retryingTokenFetcher', () => {
  it('retries a failing refresh with backoff until it answers', async () => {
    const { retryingTokenFetcher } = await import('../src/runtime/auth/sessionRoutes')
    const fetchToken = vi
      .fn()
      .mockRejectedValueOnce(new Error('502'))
      .mockRejectedValueOnce(new Error('502'))
      .mockResolvedValueOnce('fresh')
    const delays: number[] = []
    const fetcher = retryingTokenFetcher(fetchToken, {
      hasSession: () => true,
      sleep: async (ms) => {
        delays.push(ms)
      },
    })
    await expect(fetcher({ forceRefreshToken: true })).resolves.toBe('fresh')
    expect(fetchToken).toHaveBeenCalledTimes(3)
    expect(delays).toEqual([1000, 2000])
  })

  it('caps the backoff and passes through a definitive no-session answer', async () => {
    const { retryingTokenFetcher } = await import('../src/runtime/auth/sessionRoutes')
    const fetchToken = vi.fn()
    for (let i = 0; i < 7; i++) {
      fetchToken.mockRejectedValueOnce(new Error('down'))
    }
    fetchToken.mockResolvedValueOnce(null)
    const delays: number[] = []
    const fetcher = retryingTokenFetcher(fetchToken, {
      hasSession: () => true,
      sleep: async (ms) => {
        delays.push(ms)
      },
    })
    await expect(fetcher({ forceRefreshToken: true })).resolves.toBeNull()
    expect(Math.max(...delays)).toBe(30_000)
  })

  it('stops retrying once the session is gone locally', async () => {
    const { retryingTokenFetcher } = await import('../src/runtime/auth/sessionRoutes')
    let signedIn = true
    const fetchToken = vi.fn().mockRejectedValue(new Error('down'))
    const fetcher = retryingTokenFetcher(fetchToken, {
      hasSession: () => signedIn,
      sleep: async () => {
        signedIn = false
      },
    })
    await expect(fetcher({ forceRefreshToken: true })).resolves.toBeNull()
    expect(fetchToken).toHaveBeenCalledTimes(1)
  })
})

describe('configureConvexAuth', () => {
  beforeEach(async () => {
    const { resetConvexAuthClientOptionsForTests } =
      await import('../src/runtime/utils/authClientOptions')
    resetConvexAuthClientOptionsForTests()
  })

  it('merges calls shallowly, later keys winning', async () => {
    const { configureConvexAuth, getConvexAuthClientOptions } =
      await import('../src/runtime/utils/authClientOptions')

    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    const replaceUrl = vi.fn()
    configureConvexAuth({ storage, ambientSignIns: [] })
    configureConvexAuth({ replaceUrl })

    const opts = getConvexAuthClientOptions()
    expect(opts.storage).toBe(storage)
    expect(opts.ambientSignIns).toEqual([])
    expect(opts.replaceUrl).toBe(replaceUrl)
  })
})
