import type { H3Event } from 'h3'
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  setCookie,
} from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import {
  AUTH_JWT_COOKIE_MAX_AGE,
  isHttpOnlyAuth,
  resolveAuthCookieName,
  resolveAuthPresentCookieName,
  resolveAuthRefreshCookieName,
  type ConvexAuthConfig,
} from '../utils/authStorage'

export interface AuthCookieSet {
  token: string | null
  refreshToken?: string | null
}

function readAuthConfig(event: H3Event): ConvexAuthConfig | undefined {
  try {
    const config = useRuntimeConfig(event)
    return (config.public?.convex as { auth?: ConvexAuthConfig } | undefined)
      ?.auth
  }
  catch {
    return undefined
  }
}

function isLocalHost(event: H3Event): boolean {
  const host = getRequestHeader(event, 'host') ?? ''
  return (
    host.startsWith('localhost')
    || host.startsWith('127.0.0.1')
    || host.startsWith('[::1]')
  )
}

function httpOnlyCookieOptions(event: H3Event) {
  const local = isLocalHost(event)
  return {
    httpOnly: true,
    secure: !local,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: AUTH_JWT_COOKIE_MAX_AGE,
  }
}

function readableCookieOptions(event: H3Event) {
  const local = isLocalHost(event)
  return {
    httpOnly: false,
    secure: !local,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: AUTH_JWT_COOKIE_MAX_AGE,
  }
}

/** Persist or clear HttpOnly auth cookies + readable presence marker. */
export function setAuthCookies(event: H3Event, tokens: AuthCookieSet): void {
  const auth = readAuthConfig(event)
  if (!isHttpOnlyAuth(auth)) {
    throw new Error(
      '[convex-nuxt] setAuthCookies requires convex.auth.httpOnly: true',
    )
  }

  const jwtName = resolveAuthCookieName(auth)!
  const refreshName = resolveAuthRefreshCookieName(auth)!
  const presentName = resolveAuthPresentCookieName(auth)!
  const httpOpts = httpOnlyCookieOptions(event)
  const presentOpts = readableCookieOptions(event)

  if (!tokens.token) {
    deleteCookie(event, jwtName, httpOpts)
    deleteCookie(event, refreshName, httpOpts)
    deleteCookie(event, presentName, presentOpts)
    return
  }

  setCookie(event, jwtName, tokens.token, httpOpts)
  if (tokens.refreshToken) {
    setCookie(event, refreshName, tokens.refreshToken, httpOpts)
  }
  setCookie(event, presentName, '1', presentOpts)
}

export function readHttpOnlyJwt(event: H3Event): string | undefined {
  const auth = readAuthConfig(event)
  const name = resolveAuthCookieName(auth)
  if (!name) {
    return undefined
  }
  return getCookie(event, name) || undefined
}

export function readHttpOnlyRefresh(event: H3Event): string | undefined {
  const auth = readAuthConfig(event)
  const name = resolveAuthRefreshCookieName(auth)
  if (!name) {
    return undefined
  }
  return getCookie(event, name) || undefined
}
