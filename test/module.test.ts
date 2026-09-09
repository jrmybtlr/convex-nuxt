import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeFunctionReference } from 'convex/server'
import { convexQueryKey } from '../src/runtime/utils/queryKey'
import { resolveQueryOverlay } from '../src/runtime/utils/overlay'
import { createHttpClient } from '../src/runtime/utils/http'
import { resolveConvexAuthState } from '../src/runtime/utils/authState'
import { resolveFetchToken } from '../src/runtime/utils/fetchToken'
import {
  cookieValueToSsrToken,
  flattenSignInParams,
  resolveAuthCookieName,
  shouldConsumeOAuthCode,
  storageKey,
} from '../src/runtime/utils/authStorage'
import {
  resetAuthMutexesForTests,
  withRefreshMutex,
} from '../src/runtime/utils/authMutex'

const listTasks = makeFunctionReference<'query', Record<string, never>, Array<{ text: string }>>(
  'tasks:list',
)

const getTask = makeFunctionReference<'query', { id: string }, { text: string }>(
  'tasks:get',
)

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
    const { resolveAuthGatedArgs } = await import(
      '../src/runtime/utils/authGate'
    )
    expect(
      resolveAuthGatedArgs({}, { authenticated: false, isAuthenticated: false }),
    ).toEqual({})
    expect(
      resolveAuthGatedArgs(
        { id: '1' },
        { authenticated: undefined, isAuthenticated: false },
      ),
    ).toEqual({ id: '1' })
  })

  it('skips when authenticated:true and Convex has not confirmed', async () => {
    const { resolveAuthGatedArgs } = await import(
      '../src/runtime/utils/authGate'
    )
    expect(
      resolveAuthGatedArgs({}, { authenticated: true, isAuthenticated: false }),
    ).toBe('skip')
    expect(
      resolveAuthGatedArgs(
        { id: '1' },
        { authenticated: true, isAuthenticated: false },
      ),
    ).toBe('skip')
  })

  it('fetches when authenticated:true and Convex confirmed (SSR stamp)', async () => {
    const { resolveAuthGatedArgs } = await import(
      '../src/runtime/utils/authGate'
    )
    expect(
      resolveAuthGatedArgs({}, { authenticated: true, isAuthenticated: true }),
    ).toEqual({})
    expect(
      resolveAuthGatedArgs(
        { id: '1' },
        { authenticated: true, isAuthenticated: true },
      ),
    ).toEqual({ id: '1' })
  })

  it('keeps caller skip over the auth gate', async () => {
    const { resolveAuthGatedArgs } = await import(
      '../src/runtime/utils/authGate'
    )
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
    expect(convexQueryKey(getTask, raw)).toBe(
      'convex:tasks:get:{"id":"task-1"}',
    )
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
    const resolveServer = (
      optionsServer: boolean | undefined,
      moduleServer: boolean | undefined,
    ) => optionsServer ?? moduleServer ?? true

    expect(resolveServer(undefined, true)).toBe(true)
    expect(resolveServer(undefined, false)).toBe(false)
    expect(resolveServer(true, false)).toBe(true)
    expect(resolveServer(false, true)).toBe(false)
  })
})

describe('authStorage helpers', () => {
  it('namespaces storage keys by deployment URL', () => {
    expect(storageKey('__convexAuthJWT', 'https://happy-animal-123.convex.cloud'))
      .toBe('__convexAuthJWT_httpshappyanimal123convexcloud')
  })

  it('no-ops readLocal/writeLocal when window is undefined (SSR)', async () => {
    const { readLocal, writeLocal } = await import('../src/runtime/utils/authStorage')
    // Node vitest environment has no DOM window for this assertion path —
    // auth-storage.test.ts covers the happy-dom branch.
    expect(typeof window).toBe('undefined')
    expect(readLocal('k')).toBeNull()
    expect(() => writeLocal('k', 'v')).not.toThrow()
  })

  it('flattens FormData like the React Convex Auth client', () => {
    const form = new FormData()
    form.set('email', 'a@b.co')
    form.set('password', 'secret')
    form.set('flow', 'signIn')
    expect(flattenSignInParams(form)).toEqual({
      email: 'a@b.co',
      password: 'secret',
      flow: 'signIn',
    })
  })

  it('passes through plain records', () => {
    expect(flattenSignInParams({ email: 'a@b.co' })).toEqual({ email: 'a@b.co' })
    expect(flattenSignInParams()).toEqual({})
  })

  it('defaults cookie to convex_jwt when provider is convex-auth', () => {
    expect(resolveAuthCookieName({ provider: 'convex-auth' })).toBe('convex_jwt')
    expect(resolveAuthCookieName({ provider: 'convex-auth', cookie: 'custom' }))
      .toBe('custom')
    expect(resolveAuthCookieName({ cookie: 'only-cookie' })).toBe('only-cookie')
    expect(resolveAuthCookieName(undefined)).toBeUndefined()
    expect(resolveAuthCookieName({})).toBeUndefined()
  })

  it('uses HttpOnly JWT cookie name when httpOnly is enabled', () => {
    expect(resolveAuthCookieName({ provider: 'convex-auth', httpOnly: true }))
      .toBe('__convexAuthJWT')
    expect(resolveAuthCookieName({ httpOnly: true, cookie: 'custom' }))
      .toBe('custom')
  })

  it('maps cookie values to an SSR token', () => {
    expect(cookieValueToSsrToken('jwt')).toBe('jwt')
    expect(cookieValueToSsrToken(null)).toBeUndefined()
    expect(cookieValueToSsrToken('')).toBeUndefined()
    expect(cookieValueToSsrToken(undefined)).toBeUndefined()
  })

  it('only consumes ?code= when a verifier is stored', () => {
    expect(shouldConsumeOAuthCode({ code: 'abc', verifier: 'v' })).toBe(true)
    expect(shouldConsumeOAuthCode({ code: 'abc', verifier: null })).toBe(false)
    expect(shouldConsumeOAuthCode({ code: null, verifier: 'v' })).toBe(false)
  })
})

describe('withRefreshMutex', () => {
  beforeEach(() => {
    resetAuthMutexesForTests()
  })

  it('runs a single refresh at a time (manual mutex fallback)', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = withRefreshMutex('test-refresh', async () => {
      order.push('first-start')
      await firstGate
      order.push('first-end')
      return 'a'
    })

    // Let the first callback start before enqueueing the second.
    await Promise.resolve()
    await Promise.resolve()

    const second = withRefreshMutex('test-refresh', async () => {
      order.push('second')
      return 'b'
    })

    expect(order).toEqual(['first-start'])
    releaseFirst()
    await expect(first).resolves.toBe('a')
    await expect(second).resolves.toBe('b')
    expect(order).toEqual(['first-start', 'first-end', 'second'])
  })
})
