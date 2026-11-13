import { computed, type ComputedRef, type Ref } from 'vue'
import { useCookie, useRuntimeConfig, useState } from 'nuxt/app'
import {
  SSR_TOKEN_STATE_KEY,
  cookieValueToSsrToken,
  isConvexAuth,
  resolveAuthCookieName,
  type ConvexAuthConfig,
} from './authStorage'

type ConvexPublicAuth = {
  auth?: ConvexAuthConfig
}

function readAuthConfig(): ConvexAuthConfig | undefined {
  const config = useRuntimeConfig()
  return (config.public.convex as ConvexPublicAuth | undefined)?.auth
}

/**
 * Convex Auth access token shared between server and client via the Nuxt
 * payload. The server fills it from the (refreshed) SSR session; the client
 * auth plugin keeps it in sync with the live `AuthClient` token.
 */
export function useConvexAuthTokenState(): Ref<string | null> {
  return useState<string | null>(SSR_TOKEN_STATE_KEY, () => null)
}

/** BYO providers: readable JWT cookie written by the app after sign-in. */
export function useAuthJwtCookie() {
  const auth = readAuthConfig()
  if (isConvexAuth(auth)) {
    return undefined
  }
  const name = resolveAuthCookieName(auth)
  if (!name) {
    return undefined
  }
  return useCookie<string | null>(name, {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
}

/** Reactive JWT for HttpClient + SSR. */
export function useSsrTokenRef(): ComputedRef<string | undefined> {
  if (isConvexAuth(readAuthConfig())) {
    const state = useConvexAuthTokenState()
    return computed(() => state.value || undefined)
  }
  const cookie = useAuthJwtCookie()
  return computed(() => cookieValueToSsrToken(cookie?.value))
}

/** Session hint for UI gating: a JWT is known for this request / client. */
export function useHasSsrSessionRef(): ComputedRef<boolean> {
  const token = useSsrTokenRef()
  return computed(() => !!token.value)
}
