/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { computed, nextTick, ref } from 'vue'
import {
  readLocal,
  readVerifierAsync,
  storageKey,
  JWT_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
  VERIFIER_STORAGE_KEY,
  writeLocal,
  writeVerifier,
} from '../src/runtime/utils/authStorage'
import {
  configureConvexAuth,
  resetConvexAuthClientOptionsForTests,
  resetInMemoryTokenStorageForTests,
} from '../src/runtime/utils/authClientOptions'
import { resetAuthMutexesForTests } from '../src/runtime/utils/authMutex'

const CONVEX_URL = 'https://example.convex.cloud'
const jwtKey = storageKey(JWT_STORAGE_KEY, CONVEX_URL)
const refreshKey = storageKey(REFRESH_TOKEN_STORAGE_KEY, CONVEX_URL)
const verifierKey = storageKey(VERIFIER_STORAGE_KEY, CONVEX_URL)

const { cookieRef, stateStore, actionMock } = vi.hoisted(() => {
  // vitest hoisted factories run before ESM imports resolve
  const { ref } = require('vue') as typeof import('vue')
  return {
    cookieRef: ref<string | null>(null),
    stateStore: new Map<string, { value: unknown }>(),
    actionMock: vi.fn(),
  }
})

vi.mock('nuxt/app', () => ({
  useRuntimeConfig: () => ({
    public: {
      convex: {
        url: CONVEX_URL,
        auth: { provider: 'convex-auth', cookie: 'convex_jwt' },
      },
    },
  }),
  useState: <T>(key: string, init: () => T) => {
    if (!stateStore.has(key)) {
      stateStore.set(key, ref(init()))
    }
    return stateStore.get(key)!
  },
  useCookie: () => cookieRef,
}))

vi.mock('../src/runtime/utils/authCookie', () => ({
  AUTH_JWT_COOKIE_MAX_AGE: 60 * 60 * 24 * 30,
  useAuthJwtCookie: () => cookieRef,
  useSsrTokenRef: () => computed(() => cookieRef.value || undefined),
}))

vi.mock('../src/runtime/composables/useConvexAuth', () => ({
  useConvexAuth: () => ({
    isLoading: computed(() => false),
    isAuthenticated: computed(() => false),
    isRefreshing: computed(() => false),
    hasSsrSession: computed(() => !!cookieRef.value),
  }),
}))

vi.mock('../src/runtime/utils/context', () => ({
  tryUseConvexContext: () => ({
    url: CONVEX_URL,
    client: null,
    ssrToken: computed(() => cookieRef.value || undefined),
    auth: {},
    createHttpClient: vi.fn(),
  }),
  useConvexContext: () => ({
    url: CONVEX_URL,
    client: null,
    ssrToken: computed(() => cookieRef.value || undefined),
    auth: {},
    createHttpClient: vi.fn(),
  }),
}))

vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    setAuth = vi.fn()
    action = (...args: unknown[]) => actionMock(...args)
  },
}))

describe('readLocal / writeLocal', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('writes, reads, and removes values', () => {
    writeLocal('k', 'v')
    expect(readLocal('k')).toBe('v')
    writeLocal('k', null)
    expect(readLocal('k')).toBeNull()
  })

  it('returns null when localStorage throws (private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readLocal('k')).toBeNull()
    spy.mockRestore()

    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => writeLocal('k', 'v')).not.toThrow()
    setSpy.mockRestore()
  })
})

describe('auth token helpers', () => {
  beforeEach(() => {
    window.localStorage.clear()
    cookieRef.value = null
    stateStore.clear()
    actionMock.mockReset()
    resetAuthMutexesForTests()
    resetConvexAuthClientOptionsForTests()
    resetInMemoryTokenStorageForTests()
    document.cookie.split(';').forEach((part) => {
      const name = part.split('=')[0]?.trim()
      if (name) {
        document.cookie = `${name}=; Max-Age=0; Path=/`
      }
    })
    // happy-dom exposes a broken navigator.locks stub — force the
    // in-memory mutex path used in browsers without Web Locks.
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: undefined,
    })
  })

  it('getAuthToken returns the cached JWT without force refresh', async () => {
    writeLocal(jwtKey, 'cached-jwt')
    const { getAuthToken } = await import('../src/runtime/composables/useAuth')
    await expect(getAuthToken({ forceRefreshToken: false })).resolves.toBe('cached-jwt')
    expect(actionMock).not.toHaveBeenCalled()
  })

  it('getAuthToken refreshes via mutex and persists new tokens', async () => {
    writeLocal(refreshKey, 'refresh-1')
    actionMock.mockResolvedValue({
      tokens: { token: 'new-jwt', refreshToken: 'refresh-2' },
    })

    const { getAuthToken } = await import('../src/runtime/composables/useAuth')
    await expect(getAuthToken({ forceRefreshToken: true })).resolves.toBe('new-jwt')
    expect(readLocal(jwtKey)).toBe('new-jwt')
    expect(readLocal(refreshKey)).toBe('refresh-2')
    await nextTick()
    expect(cookieRef.value).toBe('new-jwt')
  })

  it('getAuthToken clears the session when refresh token is missing', async () => {
    writeLocal(jwtKey, 'stale')
    const { getAuthToken } = await import('../src/runtime/composables/useAuth')
    await expect(getAuthToken({ forceRefreshToken: true })).resolves.toBeNull()
    expect(readLocal(jwtKey)).toBeNull()
    expect(cookieRef.value).toBeNull()
  })

  it('hydrateAuthFromStorage sets hasSession and cookie from localStorage', async () => {
    writeLocal(jwtKey, 'stored-jwt')
    const { hydrateAuthFromStorage, useAuthProviderState } =
      await import('../src/runtime/composables/useAuth')
    hydrateAuthFromStorage()
    const { hasSession, isLoading } = useAuthProviderState()
    expect(hasSession.value).toBe(true)
    expect(isLoading.value).toBe(false)
    expect(cookieRef.value).toBe('stored-jwt')
  })

  it('signOut clears storage even when auth:signOut fails', async () => {
    writeLocal(jwtKey, 'jwt')
    writeLocal(refreshKey, 'refresh')
    cookieRef.value = 'jwt'
    actionMock.mockRejectedValue(new Error('already signed out'))

    const { signOut } = await import('../src/runtime/composables/useAuth')
    await signOut()
    expect(readLocal(jwtKey)).toBeNull()
    expect(readLocal(refreshKey)).toBeNull()
    expect(cookieRef.value).toBeNull()
  })

  it('keeps the OAuth verifier in a cookie when token storage is in-memory', async () => {
    configureConvexAuth({ storage: 'inMemory', storageNamespace: CONVEX_URL })
    await writeVerifier(verifierKey, 'ver-1')
    resetInMemoryTokenStorageForTests()
    expect(readLocal(verifierKey)).toBeNull()
    await expect(readVerifierAsync(verifierKey)).resolves.toBe('ver-1')
    await writeVerifier(verifierKey, null)
    await expect(readVerifierAsync(verifierKey)).resolves.toBeNull()
  })

  it('waits for async token storage before the IdP redirect', async () => {
    const order: string[] = []
    const store = new Map<string, string>()
    configureConvexAuth({
      storage: {
        getItem: async (key) => store.get(key) ?? null,
        setItem: async (key, value) => {
          order.push('set:start')
          await new Promise((resolve) => setTimeout(resolve, 20))
          store.set(key, value)
          order.push('set:done')
        },
        removeItem: async (key) => {
          store.delete(key)
        },
      },
    })
    actionMock.mockResolvedValue({
      redirect: 'https://github.com/login/oauth/authorize',
      verifier: 'ver-1',
    })

    let href = 'http://localhost/'
    const originalLocation = window.location
    const fakeLocation = {
      pathname: '/',
      search: '',
      hash: '',
      get href() {
        return href
      },
      set href(value: string) {
        order.push('redirect')
        href = value
      },
    }
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: fakeLocation,
    })

    try {
      const { signIn } = await import('../src/runtime/composables/useAuth')
      await signIn('github')
      expect(order).toEqual(['set:start', 'set:done', 'redirect'])
      expect(store.get(verifierKey)).toBe('ver-1')
      expect(href).toBe('https://github.com/login/oauth/authorize')
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      })
    }
  })

  it('clears loading when replaceURL throws', async () => {
    configureConvexAuth({
      replaceURL: () => {
        throw new Error('router blew up')
      },
    })
    writeLocal(verifierKey, 'ver-1')
    window.history.replaceState({}, '', '/callback?code=abc')

    const { consumeOAuthCodeFromUrl, useAuthProviderState } =
      await import('../src/runtime/composables/useAuth')
    await expect(consumeOAuthCodeFromUrl()).resolves.toBe(false)
    expect(actionMock).not.toHaveBeenCalled()
    const { isLoading } = useAuthProviderState()
    expect(isLoading.value).toBe(false)
  })
})
