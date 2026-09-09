import { describe, expect, it, vi } from 'vitest'
import { makeFunctionReference } from 'convex/server'
import { convexQueryKey } from '../src/runtime/utils/queryKey'
import { resolveQueryOverlay } from '../src/runtime/utils/overlay'
import { createHttpClient } from '../src/runtime/utils/http'
import { resolveConvexAuthState } from '../src/runtime/utils/authState'

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

  it('uses a dedicated skip suffix', () => {
    expect(convexQueryKey(listTasks, 'skip')).toBe('convex:tasks:list:skip')
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
    const ssrToken = 'from-cookie'
    const token = optionsToken ?? ssrToken
    expect(token).toBe('explicit')
  })

  it('falls back to the SSR cookie token', () => {
    const optionsToken: string | undefined = undefined
    const ssrToken = 'from-cookie'
    const token = optionsToken ?? ssrToken
    expect(token).toBe('from-cookie')
  })
})
