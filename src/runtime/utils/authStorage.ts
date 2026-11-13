/**
 * Shared auth configuration helpers.
 *
 * Kept free of `@convex-dev/auth` imports: apps that bring their own provider
 * (Clerk, Auth0, custom JWT) load this file without installing Convex Auth.
 */

/** Session model for first-party Convex Auth v2. */
export type ConvexAuthMode = 'ssr' | 'spa'

/** Client token storage for Convex Auth. */
export type ConvexAuthStorageMode = 'localStorage' | 'inMemory'

/**
 * Names of the session functions `setupConvexAuth` returns, as exported from
 * the app's Convex functions (e.g. `convex/auth.ts` → `'auth:refreshSession'`).
 */
export type ConvexAuthApiNames = {
  refreshSession?: string
  signOut?: string
  isAuthenticated?: string
}

export type ConvexAuthConfig = {
  provider?: 'convex-auth'
  /**
   * BYO providers: cookie whose value is a JWT for SSR queries and Nitro
   * `fetch*` helpers. Ignored for `provider: 'convex-auth'`, which manages
   * its own cookies.
   */
  cookie?: string
  /** @see ModuleAuthOptions.mode */
  mode?: ConvexAuthMode
  /** @see ModuleAuthOptions.api */
  api?: ConvexAuthApiNames
  /** @see ModuleAuthOptions.routePrefix */
  routePrefix?: string
  /** @see ModuleAuthOptions.storageNamespace */
  storageNamespace?: string
  /** @see ModuleAuthOptions.storage */
  storage?: ConvexAuthStorageMode
  /** @see ModuleAuthOptions.verbose */
  verbose?: boolean
}

/** Server-only Convex Auth options (`runtimeConfig.convexAuth`). */
export interface ConvexAuthServerRuntimeConfig {
  /** Sign-in function names the auth proxy forwards, e.g. `'auth:signInWithUsernamePassword'`. */
  signIn?: string[]
  /** Origins trusted besides the request's own Host. */
  allowedOrigins?: string[]
  /** Cookie attributes. `secure` defaults to true except on localhost. */
  cookie?: { secure?: boolean; domain?: string; path?: string }
}

/** The Convex Auth v2 access-token cookie (fixed by `@convex-dev/auth/ssr`). */
export const CONVEX_AUTH_JWT_COOKIE = '__convexAuthJWT'
/** The Convex Auth v2 refresh-token cookie (fixed by `@convex-dev/auth/ssr`). */
export const CONVEX_AUTH_REFRESH_COOKIE = '__convexAuthRefreshToken'

export const DEFAULT_AUTH_ROUTE_PREFIX = '/api/convex/auth'

export const DEFAULT_CONVEX_AUTH_API: Required<ConvexAuthApiNames> = {
  refreshSession: 'auth:refreshSession',
  signOut: 'auth:signOut',
  isAuthenticated: 'auth:isAuthenticated',
}

/** `useState` key carrying the SSR access token to the client payload. */
export const SSR_TOKEN_STATE_KEY = 'convex:auth-token'

export function isConvexAuth(auth?: ConvexAuthConfig): boolean {
  return auth?.provider === 'convex-auth'
}

/** SSR mode is the default for Convex Auth: Nuxt renders on the server. */
export function resolveAuthMode(auth?: ConvexAuthConfig): ConvexAuthMode {
  return auth?.mode ?? 'ssr'
}

export function isSsrConvexAuth(auth?: ConvexAuthConfig): boolean {
  return isConvexAuth(auth) && resolveAuthMode(auth) === 'ssr'
}

export function resolveAuthApiNames(auth?: ConvexAuthConfig): Required<ConvexAuthApiNames> {
  return { ...DEFAULT_CONVEX_AUTH_API, ...auth?.api }
}

export function resolveAuthRoutes(auth?: ConvexAuthConfig): {
  signIn: string
  refresh: string
  signOut: string
} {
  const prefix = (auth?.routePrefix ?? DEFAULT_AUTH_ROUTE_PREFIX).replace(/\/+$/, '')
  return {
    signIn: `${prefix}/signin`,
    refresh: `${prefix}/refresh`,
    signOut: `${prefix}/signout`,
  }
}

/**
 * Cookie holding the JWT for SSR reads: the Convex Auth access-token cookie
 * in SSR mode, the configured cookie for BYO providers, otherwise none.
 * Convex Auth SPA mode keeps tokens in browser storage, so it has no cookie.
 */
export function resolveAuthCookieName(auth?: ConvexAuthConfig): string | undefined {
  if (isConvexAuth(auth)) {
    return isSsrConvexAuth(auth) ? CONVEX_AUTH_JWT_COOKIE : undefined
  }
  return auth?.cookie || undefined
}

/** Empty / missing cookies are not a session. */
export function cookieValueToSsrToken(value: string | null | undefined): string | undefined {
  return value || undefined
}

/**
 * Whether a JWT's `exp` claim is within `skewSeconds` of now (or unreadable).
 * Signature is not checked — this only decides whether to refresh.
 */
export function isJwtExpiring(token: string, skewSeconds = 10, nowMs = Date.now()): boolean {
  const payload = token.split('.')[1]
  if (!payload) {
    return true
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : (
            globalThis as {
              Buffer?: { from: (s: string, e: string) => { toString: () => string } }
            }
          )
            .Buffer!.from(padded, 'base64')
            .toString()
    const exp = (JSON.parse(json) as { exp?: unknown }).exp
    if (typeof exp !== 'number') {
      return true
    }
    return exp * 1000 - skewSeconds * 1000 <= nowMs
  } catch {
    return true
  }
}

/**
 * A stable identity for the session a JWT belongs to: `iss` + `sub`.
 *
 * Convex Auth rotates the access token every minute but keeps the session
 * id in `sub`, so this changes on sign-in / sign-out / account switch, not
 * on rotation. Tokens without readable claims fall back to the token itself
 * (any change is treated as a new session). Empty for no token.
 */
export function sessionKeyFromToken(token: string | null | undefined): string {
  if (!token) {
    return ''
  }
  const payload = token.split('.')[1]
  if (payload) {
    try {
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
      const json =
        typeof atob === 'function'
          ? atob(padded)
          : (
              globalThis as {
                Buffer?: { from: (s: string, e: string) => { toString: () => string } }
              }
            )
              .Buffer!.from(padded, 'base64')
              .toString()
      const claims = JSON.parse(json) as { iss?: unknown; sub?: unknown }
      if (typeof claims.sub === 'string' && claims.sub) {
        return `${typeof claims.iss === 'string' ? claims.iss : ''}|${claims.sub}`
      }
    } catch {
      // Fall through to the raw token.
    }
  }
  return token
}
