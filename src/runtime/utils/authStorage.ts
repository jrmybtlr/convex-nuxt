/**
 * Convex Auth client storage helpers (mirrors @convex-dev/auth/react).
 */

export const JWT_STORAGE_KEY = '__convexAuthJWT'
export const REFRESH_TOKEN_STORAGE_KEY = '__convexAuthRefreshToken'
export const VERIFIER_STORAGE_KEY = '__convexAuthOAuthVerifier'

export const AUTH_JWT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export const DEFAULT_CONVEX_AUTH_COOKIE = 'convex_jwt'
/** Readable marker so the client knows an HttpOnly session exists. */
export const DEFAULT_AUTH_PRESENT_COOKIE = 'convex_auth_present'
/** HttpOnly JWT cookie (Next.js Convex Auth naming). */
export const HTTPONLY_JWT_COOKIE = '__convexAuthJWT'
/** HttpOnly refresh cookie. */
export const HTTPONLY_REFRESH_COOKIE = '__convexAuthRefreshToken'

export type ConvexAuthConfig = {
  provider?: string
  cookie?: string
  /**
   * Store JWT + refresh in HttpOnly cookies via Nitro (Next.js parity).
   * When true, JS cannot read tokens from `document.cookie`; `fetchToken`
   * uses same-origin POST `/api/convex/auth/session` with `{ getToken: true }`.
   * Prefer `true` in production. Does not make sessions XSS-proof.
   */
  httpOnly?: boolean
  /** Readable presence cookie when `httpOnly` is set (UI only). */
  presentCookie?: string
}

export function storageNamespace(url: string): string {
  return url.replace(/[^a-z0-9]/gi, '')
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
 * Resolve the auth cookie name for runtime config / SSR JWT reads.
 * When `provider === 'convex-auth'` and cookie is omitted, default to `convex_jwt`
 * (or the HttpOnly JWT name when `httpOnly` is enabled).
 */
export function resolveAuthCookieName(auth?: ConvexAuthConfig): string | undefined {
  if (auth?.httpOnly) {
    return auth.cookie ?? HTTPONLY_JWT_COOKIE
  }
  if (auth?.cookie) {
    return auth.cookie
  }
  if (auth?.provider === 'convex-auth') {
    return DEFAULT_CONVEX_AUTH_COOKIE
  }
  return undefined
}

export function resolveAuthPresentCookieName(auth?: ConvexAuthConfig): string | undefined {
  if (!auth?.httpOnly) {
    return undefined
  }
  return auth.presentCookie ?? DEFAULT_AUTH_PRESENT_COOKIE
}

export function resolveAuthRefreshCookieName(auth?: ConvexAuthConfig): string | undefined {
  if (!auth?.httpOnly) {
    return undefined
  }
  return HTTPONLY_REFRESH_COOKIE
}

export function isHttpOnlyAuth(auth?: ConvexAuthConfig): boolean {
  return auth?.httpOnly === true
}

/** Empty / missing cookies are not a session. */
export function cookieValueToSsrToken(value: string | null | undefined): string | undefined {
  return value || undefined
}

export function readLocal(key: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.localStorage.getItem(key)
  } catch {
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
    } else {
      window.localStorage.setItem(key, value)
    }
  } catch {
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
