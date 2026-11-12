/**
 * @vitest-environment happy-dom
 */
import { AuthClient, InMemoryStorage } from '@convex-dev/auth/browser'
import { getFunctionName, makeFunctionReference } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { shallowRef } from 'vue'
import {
  OAUTH_ACTIONS_KEY,
  OAUTH_FLOW_ERROR_KEY,
  OAUTH_SETUP_ID,
  convexOAuth,
  type OAuthActions,
} from '../src/runtime/auth/oauth'
import type { ConvexAuthBinding } from '../src/runtime/utils/context'

const NAMESPACE = 'https://example.convex.cloud'

const startSignIn = makeFunctionReference<'mutation'>('auth:startSignInWithGithub')
const completeSignIn = makeFunctionReference<'mutation'>('auth:completeSignInWithGithub')
const refs = { providerName: 'github', startSignIn, completeSignIn } as never

function fakeJwt(expSeconds = Math.floor(Date.now() / 1000) + 60): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${encode({ alg: 'none' })}.${encode({ exp: expSeconds, sub: 'user' })}.sig`
}

function bundle(accessToken = fakeJwt()) {
  return {
    accessToken,
    refreshToken: 'refresh-1',
    refreshTokenExpiresAt: Date.now() + 60_000,
    userId: 'users:1',
  }
}

function createClient(options: {
  storage?: InMemoryStorage
  signInMutation?: ReturnType<typeof vi.fn>
  convexMutation?: ReturnType<typeof vi.fn>
  replaceUrl?: (url: string) => void
}) {
  const storage = options.storage ?? new InMemoryStorage()
  const signInMutation = options.signInMutation ?? vi.fn()
  const convexMutation = options.convexMutation ?? vi.fn()
  const client = new AuthClient({
    mode: 'spa',
    authApi: {
      refreshSession: vi.fn(async () => ({ kind: 'noSession' as const })),
      signOut: vi.fn(async () => {}),
    },
    storage,
    storageNamespace: NAMESPACE,
    ambientSignIns: {
      signIns: [convexOAuth()],
      signInApi: { mutation: signInMutation, action: vi.fn() } as never,
      convex: { mutation: convexMutation } as never,
      replaceUrl: options.replaceUrl ?? ((url) => window.history.replaceState(null, '', url)),
    },
  })
  return { client, storage, signInMutation, convexMutation }
}

function flowStorageKey() {
  // NamespacedStorage: `<key>_<namespace without non-alphanumerics>`, scoped per sign-in id.
  return `__convexAuthSignIn_${OAUTH_SETUP_ID}_flow_${NAMESPACE.replace(/[^a-z0-9]/gi, '')}`
}

describe('convexOAuth ambient sign-in', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('redeems a convexAuthCode callback against the saved flow and adopts the session', async () => {
    const tokens = bundle()
    const signInMutation = vi.fn(async (_fn: unknown, _args: unknown) => ({
      status: 'complete',
      tokens,
    }))
    const replaceUrl = vi.fn((url: string) => window.history.replaceState(null, '', url))
    const storage = new InMemoryStorage()

    // Start a flow so the client saves its state where it will look for it.
    const convexMutation = vi.fn(async () => ({
      redirect: 'https://github.com/login/oauth/authorize?x=1',
      state: 'state-123',
    }))
    const starter = createClient({ storage, convexMutation })
    const actions = starter.client
      .ambientSignInValues(OAUTH_SETUP_ID)
      .get<OAuthActions>(OAUTH_ACTIONS_KEY)!
    const locationAssign = vi.fn()
    const realLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get href() {
          return realLocation.href
        },
        set href(value: string) {
          locationAssign(value)
        },
      },
    })
    try {
      const started = await actions.signIn(refs, { redirectTo: 'http://localhost:3000/after' })
      expect(started.status).toBe('redirect')
      expect(convexMutation).toHaveBeenCalledWith(startSignIn, {
        redirectTo: 'http://localhost:3000/after',
      })
      expect(locationAssign).toHaveBeenCalledWith('https://github.com/login/oauth/authorize?x=1')
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
    }

    // Return from the provider on a fresh page load.
    window.history.replaceState(null, '', '/after?convexAuthCode=abc&keep=1')
    const { client } = createClient({ storage, signInMutation, replaceUrl })
    await client.init()
    await vi.waitFor(() => expect(client.getSnapshot().isAuthenticated).toBe(true))

    expect(signInMutation).toHaveBeenCalledTimes(1)
    const [fn, args] = signInMutation.mock.calls[0]! as [never, unknown]
    expect(getFunctionName(fn)).toBe('auth:completeSignInWithGithub')
    expect(args).toEqual({ code: 'abc', state: 'state-123' })
    expect(client.getSnapshot().token).toBe(tokens.accessToken)
    expect(replaceUrl).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('?keep=1')
  })

  it('reports INVALID_FLOW when no flow was started in this browser', async () => {
    window.history.replaceState(null, '', '/?convexAuthCode=abc')
    const signInMutation = vi.fn()
    const { client } = createClient({ signInMutation })
    await client.init()
    const values = client.ambientSignInValues(OAUTH_SETUP_ID)
    await vi.waitFor(() =>
      expect(values.get(OAUTH_FLOW_ERROR_KEY)).toEqual({ error: 'INVALID_FLOW' }),
    )
    expect(signInMutation).not.toHaveBeenCalled()
    expect(client.getSnapshot().isAuthenticated).toBe(false)
  })

  it('maps a convexAuthError callback to a flow error and strips it', async () => {
    window.history.replaceState(null, '', '/?convexAuthError=access_denied')
    const { client } = createClient({})
    await client.init()
    expect(client.ambientSignInValues(OAUTH_SETUP_ID).get(OAUTH_FLOW_ERROR_KEY)).toEqual({
      error: 'ACCESS_DENIED',
    })
    expect(window.location.search).toBe('')
  })

  it('leaves unrelated ?code= params alone', async () => {
    window.history.replaceState(null, '', '/?code=app-owned')
    const replaceUrl = vi.fn()
    const { client } = createClient({ replaceUrl })
    await client.init()
    expect(replaceUrl).not.toHaveBeenCalled()
    expect(client.ambientSignInValues(OAUTH_SETUP_ID).get(OAUTH_FLOW_ERROR_KEY)).toBeNull()
  })

  it('stores the flow under the oauth sign-in namespace', async () => {
    const storage = new InMemoryStorage()
    const convexMutation = vi.fn(async () => ({ redirect: 'https://idp.example/x', state: 's' }))
    const { client } = createClient({ storage, convexMutation })
    const actions = client.ambientSignInValues(OAUTH_SETUP_ID).get<OAuthActions>(OAUTH_ACTIONS_KEY)!
    const realLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: realLocation.href },
    })
    try {
      await actions.signIn(refs)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
    }
    const keys = Object.keys((storage as unknown as { store: Record<string, string> }).store)
    expect(keys.some((key) => key.includes(OAUTH_SETUP_ID))).toBe(true)
    expect(flowStorageKey()).toContain(OAUTH_SETUP_ID)
  })
})

const contextRef: { current: { convexAuth: ConvexAuthBinding | null } } = vi.hoisted(() => ({
  current: { convexAuth: null },
}))

vi.mock('nuxt/app', () => ({}))

vi.mock('../src/runtime/utils/context', () => ({
  useConvexContext: () => contextRef.current,
}))

vi.mock('../src/runtime/composables/useConvexAuth', () => ({
  useConvexAuth: () => ({}),
}))

function binding(overrides: Partial<ConvexAuthBinding> = {}): ConvexAuthBinding {
  return {
    mode: 'ssr',
    state: shallowRef({ isLoading: false, isAuthenticated: false, token: null }),
    signInApi: { mutation: vi.fn(), action: vi.fn() },
    setSession: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    ambientValue: () => shallowRef(undefined),
    ...overrides,
  }
}

describe('useConvexSignIn', () => {
  const signInFn = makeFunctionReference<'mutation'>('auth:signInWithUsernamePassword')

  it('adopts the session from a complete envelope', async () => {
    const { useConvexSignIn } = await import('../src/runtime/composables/useAuth')
    const tokens = { accessToken: 'jwt', userId: 'users:1' }
    const b = binding()
    vi.mocked(b.signInApi.mutation).mockResolvedValue({ status: 'complete', tokens })
    contextRef.current = { convexAuth: b }

    const { run, pending } = useConvexSignIn(signInFn)
    const promise = run({ username: 'a', password: 'b' } as never)
    expect(pending.value).toBe(true)
    const result = await promise
    expect(pending.value).toBe(false)
    expect(result).toEqual({ status: 'complete', tokens })
    expect(b.signInApi.mutation).toHaveBeenCalledWith(signInFn, { username: 'a', password: 'b' })
    expect(b.setSession).toHaveBeenCalledWith(tokens)
  })

  it('returns method user errors without adopting a session', async () => {
    const { useConvexSignIn } = await import('../src/runtime/composables/useAuth')
    const b = binding()
    const envelope = { status: 'error', userError: { error: 'INVALID_CREDENTIALS' } }
    vi.mocked(b.signInApi.mutation).mockResolvedValue(envelope)
    contextRef.current = { convexAuth: b }

    const result = await useConvexSignIn(signInFn).run({} as never)
    expect(result).toEqual(envelope)
    expect(b.setSession).not.toHaveBeenCalled()
  })

  it('folds thrown errors into OTHER_ERROR and supports actions', async () => {
    const { useConvexSignIn } = await import('../src/runtime/composables/useAuth')
    const b = binding()
    const cause = new Error('boom')
    vi.mocked(b.signInApi.action).mockRejectedValue(cause)
    contextRef.current = { convexAuth: b }

    const actionFn = makeFunctionReference<'action'>('auth:signInWithPasskey')
    const result = await useConvexSignIn(actionFn, { kind: 'action' }).run({} as never)
    expect(result).toEqual({ status: 'error', userError: { error: 'OTHER_ERROR', cause } })
    expect(b.signInApi.mutation).not.toHaveBeenCalled()
  })

  it('throws a configuration error without Convex Auth on the client', async () => {
    const { useConvexSignIn } = await import('../src/runtime/composables/useAuth')
    contextRef.current = { convexAuth: null }
    expect(() => useConvexSignIn(signInFn)).toThrowError(/convex-auth/)
  })
})
