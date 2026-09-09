/**
 * Convex Auth client storage helpers (mirrors @convex-dev/auth/react).
 */

export const JWT_STORAGE_KEY = '__convexAuthJWT'
export const REFRESH_TOKEN_STORAGE_KEY = '__convexAuthRefreshToken'
export const VERIFIER_STORAGE_KEY = '__convexAuthOAuthVerifier'

export const DEFAULT_CONVEX_AUTH_COOKIE = 'convex_jwt'

export function storageNamespace(url: string): string {
  return url.replace(/[^a-zA-Z0-9]/g, '')
}

export function storageKey(base: string, url: string): string {
  return `${base}_${storageNamespace(url)}`
}

/**
 * Flatten FormData (or pass through a plain record) the same way the React
 * Convex Auth client does before calling `auth:signIn`.
 */
export function flattenSignInParams(
  params?: FormData | Record<string, string>,
): Record<string, string> {
  if (params === undefined) {
    return {}
  }
  if (typeof FormData !== 'undefined' && params instanceof FormData) {
    const out: Record<string, string> = {}
    params.forEach((value, key) => {
      if (typeof value === 'string') {
        out[key] = value
      }
    })
    return out
  }
  return { ...(params as Record<string, string>) }
}

/**
 * Resolve the auth cookie name for runtime config.
 * When `provider === 'convex-auth'` and cookie is omitted, default to `convex_jwt`.
 */
export function resolveAuthCookieName(auth?: {
  provider?: string
  cookie?: string
}): string | undefined {
  if (auth?.cookie) {
    return auth.cookie
  }
  if (auth?.provider === 'convex-auth') {
    return DEFAULT_CONVEX_AUTH_COOKIE
  }
  return undefined
}

export function readLocal(key: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.localStorage.getItem(key)
  }
  catch {
    return null
  }
}

export function writeLocal(key: string, value: string | null): void {
  if (typeof window === 'undefined') {
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

/**
 * Whether the current URL's `?code=` should be treated as an OAuth callback.
 * Only true when we previously stored a verifier (we started the flow).
 */
export function shouldConsumeOAuthCode(options: {
  code: string | null
  verifier: string | null
}): boolean {
  return options.code !== null && options.verifier !== null
}
