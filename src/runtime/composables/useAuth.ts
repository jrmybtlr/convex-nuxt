import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import {
  computed,
  nextTick,
  type ComputedRef,
  type Ref,
} from 'vue'
import {
  useCookie,
  useRuntimeConfig,
  useState,
} from 'nuxt/app'
import { useConvexAuth } from './useConvexAuth'
import { withRefreshMutex } from '../utils/authMutex'
import {
  flattenSignInParams,
  JWT_STORAGE_KEY,
  readLocal,
  REFRESH_TOKEN_STORAGE_KEY,
  resolveAuthCookieName,
  shouldConsumeOAuthCode,
  storageKey,
  VERIFIER_STORAGE_KEY,
  writeLocal,
} from '../utils/authStorage'
import { tryUseConvexContext } from '../utils/context'

export type AuthTokens = {
  token: string
  refreshToken: string
}

export type SignInResult = {
  signingIn: boolean
  redirect?: URL
}

type SignInActionResult = {
  redirect?: string
  verifier?: string
  tokens?: AuthTokens | null
  started?: boolean
}

const authSignIn = makeFunctionReference<
  'action',
  {
    provider?: string
    params?: Record<string, string>
    verifier?: string
    refreshToken?: string
  },
  SignInActionResult
>('auth:signIn')

const authSignOut = makeFunctionReference<'action', Record<string, never>, null>(
  'auth:signOut',
)

const RETRY_BACKOFF = [500, 2000]
const RETRY_JITTER = 100

export interface UseAuthReturn {
  isLoading: ComputedRef<boolean>
  isAuthenticated: ComputedRef<boolean>
  isRefreshing: ComputedRef<boolean>
  error: Ref<string | null>
  pending: Ref<boolean>
  signIn: typeof signIn
  signOut: typeof signOut
}

/**
 * First-party Convex Auth session state + actions.
 *
 * Only auto-imported when `convex.auth.provider === 'convex-auth'`.
 * Wire-up happens in `plugin.auth.client` — call `signIn` / `signOut` from forms.
 */
export function useAuth(): UseAuthReturn {
  const session = useAuthSession()
  // When Convex URL is unset the core plugins no-op — still expose session
  // refs so pages can render the "set NUXT_PUBLIC_CONVEX_URL" empty state.
  if (!tryUseConvexContext()) {
    return {
      isLoading: computed(() => session.isLoading.value),
      isAuthenticated: computed(() => false),
      isRefreshing: computed(() => false),
      error: session.error,
      pending: session.pending,
      signIn,
      signOut,
    }
  }

  const convexAuth = useConvexAuth()

  return {
    isLoading: convexAuth.isLoading,
    isAuthenticated: convexAuth.isAuthenticated,
    isRefreshing: convexAuth.isRefreshing,
    error: session.error,
    pending: session.pending,
    signIn,
    signOut,
  }
}

/**
 * Sign in with a Convex Auth provider (password, OAuth, OTP, …).
 * Mirrors `@convex-dev/auth/react` `useAuthActions().signIn`.
 */
export async function signIn(
  provider?: string,
  params?: FormData | Record<string, string>,
): Promise<SignInResult> {
  const session = useAuthSession()
  const convexUrl = session.convexUrl
  if (!convexUrl) {
    throw new Error('Convex URL is not configured')
  }

  session.pending.value = true
  session.error.value = null
  try {
    const flatParams = flattenSignInParams(params)
    const existingVerifier = readLocal(session.verifierKey.value) ?? undefined
    writeLocal(session.verifierKey.value, null)

    const result = await callSignIn(convexUrl, {
      provider,
      params: flatParams,
      verifier: existingVerifier,
    })

    if (result.redirect !== undefined) {
      const url = new URL(result.redirect)
      if (result.verifier) {
        writeLocal(session.verifierKey.value, result.verifier)
      }
      if (import.meta.client) {
        window.location.href = url.toString()
      }
      return { signingIn: false, redirect: url }
    }

    if (result.tokens !== undefined) {
      persistTokens(session, result.tokens)
      return { signingIn: result.tokens !== null }
    }

    // Magic link / email: `{ started: true }` — no tokens yet.
    return { signingIn: false }
  }
  catch (cause) {
    const message
      = cause instanceof Error ? cause.message : 'Authentication failed'
    session.error.value = message
    throw cause
  }
  finally {
    session.pending.value = false
  }
}

/**
 * Sign out and clear local tokens + SSR JWT cookie.
 */
export async function signOut(): Promise<void> {
  const session = useAuthSession()
  const convexUrl = session.convexUrl

  session.pending.value = true
  session.error.value = null
  try {
    if (convexUrl) {
      const token = readLocal(session.jwtKey.value)
      const http = new ConvexHttpClient(convexUrl)
      if (token) {
        http.setAuth(token)
      }
      try {
        await http.action(authSignOut, {})
      }
      catch {
        // Already signed out is fine.
      }
    }
    persistTokens(session, null)
  }
  finally {
    session.pending.value = false
  }
}

/** @internal Used by the Convex Auth client plugin. */
export function hydrateAuthFromStorage(): void {
  const session = useAuthSession()
  if (!session.convexUrl) {
    session.isLoading.value = false
    session.hasSession.value = false
    return
  }
  const token = readLocal(session.jwtKey.value)
  session.hasSession.value = token !== null
  session.isLoading.value = false
  if (token) {
    setJwtCookie(session, token)
  }
}

/** @internal Sync check for OAuth `?code=` + stored verifier (no await). */
export function hasPendingOAuthCallback(): boolean {
  if (!import.meta.client) {
    return false
  }
  const session = useAuthSession()
  if (!session.convexUrl) {
    return false
  }
  const code = new URLSearchParams(window.location.search).get('code')
  const verifier = readLocal(session.verifierKey.value)
  return shouldConsumeOAuthCode({ code, verifier })
}

/** @internal Used by the Convex Auth client plugin. */
export async function consumeOAuthCodeFromUrl(): Promise<boolean> {
  if (!import.meta.client) {
    return false
  }
  const session = useAuthSession()
  if (!session.convexUrl) {
    return false
  }

  const code = new URLSearchParams(window.location.search).get('code')
  const verifier = readLocal(session.verifierKey.value)
  if (!shouldConsumeOAuthCode({ code, verifier })) {
    return false
  }

  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  window.history.replaceState({}, '', url.pathname + url.search + url.hash)

  session.pending.value = true
  session.error.value = null
  // Keep provider loading until tokens land so gated queries stay skipped.
  session.isLoading.value = true
  try {
    writeLocal(session.verifierKey.value, null)
    const result = await callSignInWithRetry(session.convexUrl, {
      params: { code: code! },
      verifier: verifier!,
    })
    persistTokens(session, result.tokens ?? null)
    return result.tokens != null
  }
  catch (cause) {
    const message
      = cause instanceof Error ? cause.message : 'OAuth callback failed'
    session.error.value = message
    persistTokens(session, null)
    return false
  }
  finally {
    session.pending.value = false
  }
}

/** @internal Token fetcher for `useConvexAuth({ fetchToken })`. */
export async function getAuthToken({
  forceRefreshToken,
}: {
  forceRefreshToken: boolean
}): Promise<string | null> {
  const session = useAuthSession()
  const convexUrl = session.convexUrl
  if (!convexUrl) {
    return null
  }

  if (!forceRefreshToken) {
    return readLocal(session.jwtKey.value)
  }

  return withRefreshMutex(session.refreshKey.value, async () => {
    const refreshToken = readLocal(session.refreshKey.value)
    if (!refreshToken) {
      persistTokens(session, null)
      return null
    }

    try {
      const result = await callSignInWithRetry(convexUrl, { refreshToken })
      const tokens = result.tokens ?? null
      if (!tokens) {
        persistTokens(session, null)
        return null
      }
      persistTokens(session, tokens)
      return tokens.token
    }
    catch {
      persistTokens(session, null)
      return null
    }
  })
}

/** @internal Provider session flags for `useConvexAuth`. */
export function useAuthProviderState() {
  const session = useAuthSession()
  return {
    isLoading: computed(() => session.isLoading.value),
    hasSession: computed(() => session.hasSession.value),
  }
}

interface AuthSession {
  convexUrl: string | undefined
  cookieName: string
  jwtKey: ComputedRef<string>
  refreshKey: ComputedRef<string>
  verifierKey: ComputedRef<string>
  isLoading: Ref<boolean>
  hasSession: Ref<boolean>
  error: Ref<string | null>
  pending: Ref<boolean>
}

function useAuthSession(): AuthSession {
  const config = useRuntimeConfig()
  const convexConfig = config.public.convex as
    | { url?: string, auth?: { provider?: string, cookie?: string } }
    | undefined
  const convexUrl = convexConfig?.url
  const cookieName
    = resolveAuthCookieName(convexConfig?.auth) ?? 'convex_jwt'

  const isLoading = useState('convex-auth-loading', () => true)
  const hasSession = useState('convex-auth-has-session', () => false)
  const error = useState<string | null>('convex-auth-error', () => null)
  const pending = useState('convex-auth-pending', () => false)

  const jwtKey = computed(() =>
    convexUrl ? storageKey(JWT_STORAGE_KEY, convexUrl) : JWT_STORAGE_KEY,
  )
  const refreshKey = computed(() =>
    convexUrl
      ? storageKey(REFRESH_TOKEN_STORAGE_KEY, convexUrl)
      : REFRESH_TOKEN_STORAGE_KEY,
  )
  const verifierKey = computed(() =>
    convexUrl
      ? storageKey(VERIFIER_STORAGE_KEY, convexUrl)
      : VERIFIER_STORAGE_KEY,
  )

  return {
    convexUrl,
    cookieName,
    jwtKey,
    refreshKey,
    verifierKey,
    isLoading,
    hasSession,
    error,
    pending,
  }
}

function setJwtCookie(session: AuthSession, token: string | null): void {
  const cookie = useCookie(session.cookieName, {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  cookie.value = token
}

function persistTokens(session: AuthSession, tokens: AuthTokens | null): void {
  if (tokens === null) {
    writeLocal(session.jwtKey.value, null)
    writeLocal(session.refreshKey.value, null)
    setJwtCookie(session, null)
    session.hasSession.value = false
    session.isLoading.value = false
    return
  }
  writeLocal(session.jwtKey.value, tokens.token)
  writeLocal(session.refreshKey.value, tokens.refreshToken)
  // Flip session BEFORE the cookie so useConvexAuth can call setAuth
  // before any gated page mounts on the cookie signal.
  session.hasSession.value = true
  session.isLoading.value = false
  nextTick(() => {
    setJwtCookie(session, tokens.token)
  })
}

async function callSignIn(
  convexUrl: string,
  args: {
    provider?: string
    params?: Record<string, string>
    verifier?: string
    refreshToken?: string
  },
): Promise<SignInActionResult> {
  const http = new ConvexHttpClient(convexUrl)
  return await http.action(authSignIn, args)
}

async function callSignInWithRetry(
  convexUrl: string,
  args: {
    params?: Record<string, string>
    verifier?: string
    refreshToken?: string
  },
): Promise<SignInActionResult> {
  let lastError: unknown
  let retry = 0
  while (retry < RETRY_BACKOFF.length) {
    try {
      return await callSignIn(convexUrl, args)
    }
    catch (e) {
      lastError = e
      if (!isNetworkError(e)) {
        break
      }
      const wait = RETRY_BACKOFF[retry]! + RETRY_JITTER * Math.random()
      retry++
      await new Promise(resolve => setTimeout(resolve, wait))
    }
  }
  throw lastError
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true
  }
  if (
    error instanceof Error
    && /network|fetch|Failed to fetch/i.test(error.message)
  ) {
    return true
  }
  return false
}
