import { computed, type ComputedRef } from 'vue'
import { useCookie, useRuntimeConfig } from 'nuxt/app'
import {
  AUTH_JWT_COOKIE_MAX_AGE,
  cookieValueToSsrToken,
  isHttpOnlyAuth,
  resolveAuthCookieName,
  resolveAuthPresentCookieName,
  type ConvexAuthConfig,
} from './authStorage'

type ConvexPublicAuth = {
  auth?: ConvexAuthConfig
}

function cookieOptions(httpOnly: boolean) {
  return {
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: AUTH_JWT_COOKIE_MAX_AGE,
    path: '/',
    httpOnly,
  }
}

/**
 * Shared JWT cookie for SSR snapshots. Same name + options as persistTokens
 * so plugin reads and sign-in/out writes share one Nuxt cookie ref.
 *
 * When `auth.httpOnly` is set, this cookie is HttpOnly (server-readable only).
 */
export function useAuthJwtCookie() {
  const config = useRuntimeConfig()
  const convexConfig = config.public.convex as ConvexPublicAuth | undefined
  const name = resolveAuthCookieName(convexConfig?.auth)
  if (!name) {
    return undefined
  }
  const httpOnly = isHttpOnlyAuth(convexConfig?.auth)
  return useCookie<string | null>(name, cookieOptions(httpOnly))
}

/**
 * Readable presence marker used when JWT is HttpOnly so the client can still
 * compute `hasSsrSession` / `showAuthedUi` without reading the token.
 */
export function useAuthPresentCookie() {
  const config = useRuntimeConfig()
  const convexConfig = config.public.convex as ConvexPublicAuth | undefined
  const name = resolveAuthPresentCookieName(convexConfig?.auth)
  if (!name) {
    return undefined
  }
  return useCookie<string | null>(name, cookieOptions(false))
}

/** Reactive JWT for HttpClient + SSR. Empty on the client when HttpOnly. */
export function useSsrTokenRef(): ComputedRef<string | undefined> {
  const cookie = useAuthJwtCookie()
  return computed(() => cookieValueToSsrToken(cookie?.value))
}

/**
 * Session hint for UI gating: JWT readable, or HttpOnly presence cookie.
 */
export function useHasSsrSessionRef(): ComputedRef<boolean> {
  const token = useSsrTokenRef()
  const present = useAuthPresentCookie()
  return computed(() => !!token.value || present?.value === '1')
}
