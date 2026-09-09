import { navigateTo } from 'nuxt/app'
import {
  computed,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'
import { useConvexAuth } from './useConvexAuth'
import { tryUseConvexContext } from '../utils/context'

/**
 * Current JWT for authenticated HTTP calls (React `@convex-dev/auth`
 * `useAuthToken` parity).
 *
 * Prefers `ConvexClient.getAuth()`, then the configured `fetchToken`
 * (Convex Auth / BYO). Returns `null` when signed out or unavailable.
 */
export function useAuthToken(): ComputedRef<string | null> {
  const token = ref<string | null>(null) as Ref<string | null>
  const ctx = tryUseConvexContext()
  if (!ctx) {
    return computed(() => null)
  }

  const auth = useConvexAuth()

  const refresh = async () => {
    if (!ctx.client) {
      token.value = null
      return
    }

    try {
      const claims = ctx.client.getAuth()
      if (claims?.token) {
        token.value = claims.token
        return
      }
    }
    catch {
      // Client may be disabled / closed.
    }

    if (!auth.isAuthenticated.value) {
      token.value = null
      return
    }

    const fetchToken = ctx.auth.fetchToken
    if (!fetchToken) {
      token.value = null
      return
    }

    try {
      token.value = (await fetchToken({ forceRefreshToken: false })) ?? null
    }
    catch {
      token.value = null
    }
  }

  watch(
    [
      () => auth.isAuthenticated.value,
      () => auth.isRefreshing.value,
      () => auth.isLoading.value,
    ],
    () => {
      void refresh()
    },
    { immediate: true },
  )

  return computed(() => token.value)
}

/**
 * Nuxt route middleware helper — redirect when the user is signed out.
 *
 * @example
 * ```ts
 * // middleware/auth.ts
 * export default defineNuxtRouteMiddleware(() => {
 *   return requireConvexAuthMiddleware({ redirectTo: '/login' })
 * })
 * ```
 */
export function requireConvexAuthMiddleware(options: {
  redirectTo?: string
} = {}): ReturnType<typeof navigateTo> | void {
  const redirectTo = options.redirectTo ?? '/login'
  const ctx = tryUseConvexContext()
  if (!ctx) {
    return navigateTo(redirectTo)
  }

  const auth = useConvexAuth()
  // Prefer SSR-safe shell flag so cookie sessions pass on first paint.
  if (auth.showAuthedUi.value) {
    return
  }
  if (auth.isLoading.value) {
    return
  }
  return navigateTo(redirectTo)
}
