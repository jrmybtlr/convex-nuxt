import type { H3Event } from 'h3'
import { deleteCookie, getCookie, getRequestHeader, setCookie } from 'h3'
import {
  AUTH_JWT_COOKIE_MAX_AGE,
  isHttpOnlyAuth,
  resolveAuthCookieName,
  resolveAuthPresentCookieName,
  resolveAuthRefreshCookieName,
} from '../utils/authStorage'
import { readConvexConfig } from './convexConfig'

export interface AuthCookieSet {
  token: string | null
  refreshToken?: string | null
}

function readAuthConfig(event: H3Event) {
  return readConvexConfig(event)?.auth
}

function isLocalHost(event: H3Event): boolean {
  const host = getRequestHeader(event, 'host') ?? ''
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')
}

function cookieOptions(event: H3Event, httpOnly: boolean) {
  const local = isLocalHost(event)
  return {
    httpOnly,
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
    throw new Error('[use-convex] setAuthCookies requires convex.auth.httpOnly: true')
  }

  const jwtName = resolveAuthCookieName(auth)!
  const refreshName = resolveAuthRefreshCookieName(auth)!
  const presentName = resolveAuthPresentCookieName(auth)!
  const httpOpts = cookieOptions(event, true)
  const presentOpts = cookieOptions(event, false)

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
