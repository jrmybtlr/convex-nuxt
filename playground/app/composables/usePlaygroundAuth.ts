import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'

const JWT_STORAGE_KEY = '__convexAuthJWT'
const REFRESH_TOKEN_STORAGE_KEY = '__convexAuthRefreshToken'
const COOKIE_NAME = 'convex_jwt'

export type AuthTokens = {
  token: string
  refreshToken: string
}

function storageNamespace(url: string): string {
  return url.replace(/[^a-zA-Z0-9]/g, '')
}

function storageKey(base: string, url: string): string {
  return `${base}_${storageNamespace(url)}`
}

function readLocal(key: string): string | null {
  if (!import.meta.client) {
    return null
  }
  try {
    return window.localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function writeLocal(key: string, value: string | null): void {
  if (!import.meta.client) {
    return
  }
  try {
    if (value === null) {
      window.localStorage.removeItem(key)
    }
    else {
      window.localStorage.setItem(key, value)
    }
  }
  catch {
    // ignore quota / private mode
  }
}

function setJwtCookie(token: string | null): void {
  const cookie = useCookie(COOKIE_NAME, {
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  cookie.value = token
}

/**
 * Playground-only Convex Auth Password adapter.
 * Not part of the published `@convex/nuxt` module.
 */
export function usePlaygroundAuth() {
  const config = useRuntimeConfig()
  const convexUrl = (config.public.convex as { url?: string } | undefined)?.url

  const providerLoading = useState('playground-auth-loading', () => true)
  const providerAuthenticated = useState(
    'playground-auth-authenticated',
    () => false,
  )
  const error = useState<string | null>('playground-auth-error', () => null)
  const pending = useState('playground-auth-pending', () => false)

  const jwtKey = computed(() =>
    convexUrl ? storageKey(JWT_STORAGE_KEY, convexUrl) : JWT_STORAGE_KEY,
  )
  const refreshKey = computed(() =>
    convexUrl
      ? storageKey(REFRESH_TOKEN_STORAGE_KEY, convexUrl)
      : REFRESH_TOKEN_STORAGE_KEY,
  )

  const hydrateFromStorage = () => {
    if (!convexUrl) {
      providerLoading.value = false
      providerAuthenticated.value = false
      return
    }
    const token = readLocal(jwtKey.value)
    providerAuthenticated.value = token !== null
    providerLoading.value = false
    if (token) {
      setJwtCookie(token)
    }
  }

  const persistTokens = (tokens: AuthTokens | null) => {
    if (tokens === null) {
      writeLocal(jwtKey.value, null)
      writeLocal(refreshKey.value, null)
      setJwtCookie(null)
      providerAuthenticated.value = false
      return
    }
    writeLocal(jwtKey.value, tokens.token)
    writeLocal(refreshKey.value, tokens.refreshToken)
    // Flip provider auth BEFORE the cookie so useConvexAuth can call setAuth
    // before any gated page mounts on the cookie signal.
    providerAuthenticated.value = true
    providerLoading.value = false
    // Defer cookie write one tick so setAuth watch runs first.
    nextTick(() => {
      setJwtCookie(tokens.token)
    })
  }

  const fetchToken = async ({
    forceRefreshToken,
  }: {
    forceRefreshToken: boolean
  }): Promise<string | null> => {
    if (!convexUrl) {
      return null
    }

    if (!forceRefreshToken) {
      return readLocal(jwtKey.value)
    }

    const refreshToken = readLocal(refreshKey.value)
    if (!refreshToken) {
      persistTokens(null)
      return null
    }

    const http = new ConvexHttpClient(convexUrl)
    try {
      const result = await http.action(api.auth.signIn, { refreshToken })
      const tokens = result.tokens ?? null
      if (!tokens) {
        persistTokens(null)
        return null
      }
      persistTokens(tokens)
      return tokens.token
    }
    catch {
      persistTokens(null)
      return null
    }
  }

  const signInWithPassword = async (
    email: string,
    password: string,
    flow: 'signIn' | 'signUp',
  ) => {
    if (!convexUrl) {
      throw new Error('Convex URL is not configured')
    }
    pending.value = true
    error.value = null
    try {
      const http = new ConvexHttpClient(convexUrl)
      const result = await http.action(api.auth.signIn, {
        provider: 'password',
        params: { email, password, flow },
      })
      const tokens = result.tokens ?? null
      if (!tokens) {
        throw new Error('Sign-in did not return tokens')
      }
      persistTokens(tokens)
      providerLoading.value = false
    }
    catch (cause) {
      const message
        = cause instanceof Error ? cause.message : 'Authentication failed'
      error.value = message
      throw cause
    }
    finally {
      pending.value = false
    }
  }

  const signOut = async () => {
    if (!convexUrl) {
      persistTokens(null)
      return
    }
    pending.value = true
    error.value = null
    try {
      const token = readLocal(jwtKey.value)
      const http = new ConvexHttpClient(convexUrl)
      if (token) {
        http.setAuth(token)
      }
      try {
        await http.action(api.auth.signOut, {})
      }
      catch {
        // Already signed out is fine.
      }
      persistTokens(null)
    }
    finally {
      pending.value = false
    }
  }

  return {
    providerLoading,
    providerAuthenticated,
    error,
    pending,
    hydrateFromStorage,
    fetchToken,
    signInWithPassword,
    signOut,
    cookieName: COOKIE_NAME,
  }
}
