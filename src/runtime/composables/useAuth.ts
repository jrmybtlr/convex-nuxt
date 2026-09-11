import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { computed, nextTick, type ComputedRef, type Ref } from 'vue'
import { useRuntimeConfig, useState } from 'nuxt/app'
import { useConvexAuth } from './useConvexAuth'
import { missingConvexUrlError } from '../utils/errors'
import { withRefreshMutex } from '../utils/authMutex'
import { useAuthJwtCookie, useAuthPresentCookie } from '../utils/authCookie'
import {
  flattenSignInParams,
  isHttpOnlyAuth,
  JWT_STORAGE_KEY,
  readLocal,
  REFRESH_TOKEN_STORAGE_KEY,
  shouldConsumeOAuthCode,
  storageKey,
  VERIFIER_STORAGE_KEY,
  writeLocal,
  type ConvexAuthConfig,
} from '../utils/authStorage'
import { tryUseConvexContext } from '../utils/context'
import { parseOAuthRedirect } from '../utils/oauthRedirect'

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

const authSignOut = makeFunctionReference<'action', Record<string, never>, null>('auth:signOut')

const RETRY_BACKOFF = [500, 2000]
const RETRY_JITTER = 100

export interface UseAuthReturn {
  isLoading: ComputedRef<boolean>
  isAuthenticated: ComputedRef<boolean>
  isRefreshing: ComputedRef<boolean>
  /**
   * JWT cookie is present. Use with `isAuthenticated` to keep an SSR-gated
   * shell mounted while Convex confirms — do not live-subscribe on this alone.
   */
  hasSsrSession: ComputedRef<boolean>
  /**
   * Mount the signed-in shell when the SSR cookie is present **or** Convex
   * has confirmed auth. Prefer this over `isAuthenticated` alone.
   * Live subscriptions must still gate on `isAuthenticated`.
   */
  showAuthedUi: ComputedRef<boolean>
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
      hasSsrSession: computed(() => false),
      showAuthedUi: computed(() => false),
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
    hasSsrSession: convexAuth.hasSsrSession,
    showAuthedUi: convexAuth.showAuthedUi,
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
    throw missingConvexUrlError('signIn')
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
      const url = parseOAuthRedirect(result.redirect)
      if (result.verifier) {
        writeLocal(session.verifierKey.value, result.verifier)
      }
      if (import.meta.client) {
        window.location.href = url.toString()
      }
      return { signingIn: false, redirect: url }
    }

    if (result.tokens !== undefined) {
      await persistTokens(session, result.tokens)
      return { signingIn: result.tokens !== null }
    }

    // Magic link / email: `{ started: true }` — no tokens yet.
    return { signingIn: false }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Authentication failed'
    session.error.value = message
    throw cause
  } finally {
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
      } catch {
        // Already signed out is fine.
      }
    }
    await persistTokens(session, null)
  } finally {
    session.pending.value = false
  }
}

/** @internal */
export function hydrateAuthFromStorage(): void {
  const session = useAuthSession()
  if (!session.convexUrl) {
    session.isLoading.value = false
    session.hasSession.value = false
    return
  }

  if (session.httpOnly) {
    // Sync path: presence cookie set by Nitro after sign-in / prior SSR.
    const present = useAuthPresentCookie()
    if (present?.value === '1') {
      session.hasSession.value = true
      session.isLoading.value = false
      return
    }
    // Async confirm — keep loading until the session route responds.
    session.isLoading.value = true
    void fetchAuthSession().then((result) => {
      session.hasSession.value = result.hasSession
      session.isLoading.value = false
      if (result.hasSession) {
        const marker = useAuthPresentCookie()
        if (marker) {
          marker.value = '1'
        }
      }
    })
    return
  }

  const token = readLocal(session.jwtKey.value)
  session.hasSession.value = token !== null
  session.isLoading.value = false
  if (token) {
    setJwtCookie(token)
  }
}

/** @internal */
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

  if (session.httpOnly) {
    return withRefreshMutex(session.refreshKey.value, async () => {
      if (!forceRefreshToken) {
        const current = await fetchAuthSessionToken()
        if (current.token) {
          session.hasSession.value = true
          return current.token
        }
      }
      const refreshed = await refreshAuthSession()
      if (!refreshed) {
        await clearAuthSession()
        session.hasSession.value = false
        return null
      }
      session.hasSession.value = true
      return refreshed
    })
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
    } catch {
      persistTokens(session, null)
      return null
    }
  })
}

/** @internal */
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

/** @internal */
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
    await persistTokens(session, result.tokens ?? null)
    return result.tokens != null
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'OAuth callback failed'
    session.error.value = message
    await persistTokens(session, null)
    return false
  } finally {
    session.pending.value = false
  }
}

/** @internal */
export function useAuthProviderState() {
  const session = useAuthSession()
  return {
    isLoading: computed(() => session.isLoading.value),
    hasSession: computed(() => session.hasSession.value),
  }
}

interface AuthSession {
  convexUrl: string | undefined
  httpOnly: boolean
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
  const convexConfig = config.public.convex as { url?: string; auth?: ConvexAuthConfig } | undefined
  const convexUrl = convexConfig?.url
  const httpOnly = isHttpOnlyAuth(convexConfig?.auth)

  const isLoading = useState('convex-auth-loading', () => true)
  const hasSession = useState('convex-auth-has-session', () => false)
  const error = useState<string | null>('convex-auth-error', () => null)
  const pending = useState('convex-auth-pending', () => false)

  const jwtKey = computed(() =>
    convexUrl ? storageKey(JWT_STORAGE_KEY, convexUrl) : JWT_STORAGE_KEY,
  )
  const refreshKey = computed(() =>
    convexUrl ? storageKey(REFRESH_TOKEN_STORAGE_KEY, convexUrl) : REFRESH_TOKEN_STORAGE_KEY,
  )
  const verifierKey = computed(() =>
    convexUrl ? storageKey(VERIFIER_STORAGE_KEY, convexUrl) : VERIFIER_STORAGE_KEY,
  )

  return {
    convexUrl,
    httpOnly,
    jwtKey,
    refreshKey,
    verifierKey,
    isLoading,
    hasSession,
    error,
    pending,
  }
}

function setJwtCookie(token: string | null): void {
  const cookie = useAuthJwtCookie()
  if (!cookie) {
    return
  }
  cookie.value = token
}

function setPresentCookie(value: string | null): void {
  const cookie = useAuthPresentCookie()
  if (!cookie) {
    return
  }
  cookie.value = value
}

const AUTH_SESSION_PATH = '/api/convex/auth/session'

/** Presence check only — GET never returns the JWT. */
async function fetchAuthSession(): Promise<{
  hasSession: boolean
}> {
  try {
    return await $fetch<{ hasSession: boolean }>(AUTH_SESSION_PATH, {
      method: 'GET',
    })
  } catch {
    return { hasSession: false }
  }
}

/**
 * Retrieve the HttpOnly JWT for ConvexClient.setAuth.
 * Uses POST + same-origin CSRF so the token is not returned from GET.
 */
async function fetchAuthSessionToken(): Promise<{
  hasSession: boolean
  token: string | null
}> {
  try {
    return await $fetch<{ hasSession: boolean; token: string | null }>(AUTH_SESSION_PATH, {
      method: 'POST',
      body: { getToken: true },
    })
  } catch {
    return { hasSession: false, token: null }
  }
}

async function refreshAuthSession(): Promise<string | null> {
  try {
    const result = await $fetch<{ token: string | null }>(AUTH_SESSION_PATH, {
      method: 'POST',
      body: { refresh: true },
    })
    return result.token
  } catch {
    return null
  }
}

async function clearAuthSession(): Promise<void> {
  try {
    await $fetch(AUTH_SESSION_PATH, { method: 'DELETE' })
  } catch {
    // ignore
  }
  setPresentCookie(null)
}

async function writeHttpOnlySession(tokens: AuthTokens | null): Promise<void> {
  if (tokens === null) {
    await clearAuthSession()
    return
  }
  await $fetch(AUTH_SESSION_PATH, {
    method: 'POST',
    body: {
      token: tokens.token,
      refreshToken: tokens.refreshToken,
    },
  })
  setPresentCookie('1')
}

async function persistTokens(session: AuthSession, tokens: AuthTokens | null): Promise<void> {
  if (session.httpOnly) {
    if (tokens === null) {
      await writeHttpOnlySession(null)
      // Also clear any legacy localStorage from before httpOnly was enabled.
      writeLocal(session.jwtKey.value, null)
      writeLocal(session.refreshKey.value, null)
      session.hasSession.value = false
      session.isLoading.value = false
      return
    }
    session.hasSession.value = true
    session.isLoading.value = false
    await writeHttpOnlySession(tokens)
    return
  }

  if (tokens === null) {
    writeLocal(session.jwtKey.value, null)
    writeLocal(session.refreshKey.value, null)
    setJwtCookie(null)
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
    setJwtCookie(tokens.token)
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
    } catch (e) {
      lastError = e
      if (!isNetworkError(e)) {
        break
      }
      const wait = RETRY_BACKOFF[retry]! + RETRY_JITTER * Math.random()
      retry++
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
  throw lastError
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true
  }
  if (error instanceof Error && /network|fetch|Failed to fetch/i.test(error.message)) {
    return true
  }
  return false
}
