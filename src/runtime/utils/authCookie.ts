import { computed, type ComputedRef } from 'vue'
import { useCookie, useRuntimeConfig } from 'nuxt/app'
import {
  cookieValueToSsrToken,
  resolveAuthCookieName,
} from './authStorage'

export const AUTH_JWT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

type ConvexPublicAuth = {
  auth?: { provider?: string, cookie?: string }
}

/**
 * Shared JWT cookie for SSR snapshots. Same name + options as persistTokens
 * so plugin reads and sign-in/out writes share one Nuxt cookie ref.
 */
export function useAuthJwtCookie() {
  const config = useRuntimeConfig()
  const convexConfig = config.public.convex as ConvexPublicAuth | undefined
  const name = resolveAuthCookieName(convexConfig?.auth)
  if (!name) {
    return undefined
  }
  return useCookie<string | null>(name, {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: AUTH_JWT_COOKIE_MAX_AGE,
    path: '/',
  })
}

/** Reactive JWT for HttpClient + `hasSsrSession`. Empty when cookie is unset. */
export function useSsrTokenRef(): ComputedRef<string | undefined> {
  const cookie = useAuthJwtCookie()
  return computed(() => cookieValueToSsrToken(cookie?.value))
}
