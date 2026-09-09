import type { AuthTokenFetcher } from 'convex/browser'
import {
  computed,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue'
import { useConvexContext } from '../utils/context'
import { resolveConvexAuthState } from '../utils/authState'

export type { AuthTokenFetcher }

export interface UseConvexAuthSetupOptions {
  /**
   * Async function returning a JWT (or null). Called by ConvexClient when
   * the current token expires or is rejected. Pass `{ forceRefreshToken: true }`
   * when a fresh token is required.
   */
  fetchToken: AuthTokenFetcher
  /**
   * Auth provider is still resolving its initial session.
   * @default false
   */
  isLoading?: MaybeRefOrGetter<boolean>
  /**
   * Auth provider believes a user is signed in (has a session / tokens).
   * Defaults to `true` so a bare `fetchToken` is enough for simple demos —
   * Convex confirmation still gates `isAuthenticated`.
   * @default true
   */
  isAuthenticated?: MaybeRefOrGetter<boolean>
}

export interface UseConvexAuthReturn {
  isLoading: ComputedRef<boolean>
  isAuthenticated: ComputedRef<boolean>
  isRefreshing: ComputedRef<boolean>
}

/**
 * Provider-agnostic Convex auth state.
 *
 * Call once with `{ fetchToken }` (typically in a client plugin) to wire
 * `ConvexClient.setAuth` + token refresh. Call without args anywhere to read
 * `{ isLoading, isAuthenticated, isRefreshing }`.
 *
 * Same contract as React `useConvexAuth` / `ConvexProviderWithAuth`.
 */
export function useConvexAuth(
  setup?: UseConvexAuthSetupOptions,
): UseConvexAuthReturn {
  const ctx = useConvexContext()
  const auth = ctx.auth

  if (setup) {
    if (import.meta.server) {
      // Auth wiring is browser-only; SSR uses cookie token on HttpClient.
      return {
        isLoading: computed(() => auth.isLoading.value),
        isAuthenticated: computed(() => auth.isAuthenticated.value),
        isRefreshing: computed(() => auth.isRefreshing.value),
      }
    }

    const client = ctx.client
    if (!client) {
      throw new Error(
        '[convex-nuxt] useConvexAuth({ fetchToken }) requires ConvexClient (browser only).',
      )
    }

    auth.fetchToken = setup.fetchToken
    auth.configured = true

    const syncFromProvider = () => {
      const providerLoading = toValue(setup.isLoading) ?? false
      const providerAuthenticated = toValue(setup.isAuthenticated) ?? true

      auth.providerLoading.value = providerLoading
      auth.providerAuthenticated.value = providerAuthenticated

      if (providerLoading) {
        auth.isConvexAuthenticated.value = null
        auth.isRefreshingRaw.value = false
        applyAuthState(auth)
        return
      }

      if (!providerAuthenticated) {
        auth.isConvexAuthenticated.value = false
        auth.isRefreshingRaw.value = false
        try {
          client.client.clearAuth()
        }
        catch {
          // Client may be disabled / closed.
        }
        applyAuthState(auth)
        return
      }

      // Provider signed in — wait for Convex confirmation.
      auth.isConvexAuthenticated.value = null
      applyAuthState(auth)

      // BaseConvexClient.setAuth accepts onRefreshChange; ConvexClient.setAuth
      // does not forward it yet, so call through `.client` for refresh UX.
      client.client.setAuth(
        setup.fetchToken,
        (backendReportsIsAuthenticated) => {
          auth.isConvexAuthenticated.value = backendReportsIsAuthenticated
          applyAuthState(auth)
        },
        (isRefreshing) => {
          auth.isRefreshingRaw.value = isRefreshing
          applyAuthState(auth)
        },
      )
    }

    watch(
      () => [
        toValue(setup.isLoading) ?? false,
        toValue(setup.isAuthenticated) ?? true,
      ],
      syncFromProvider,
      { immediate: true },
    )
  }

  return {
    isLoading: computed(() => auth.isLoading.value),
    isAuthenticated: computed(() => auth.isAuthenticated.value),
    isRefreshing: computed(() => auth.isRefreshing.value),
  }
}

function applyAuthState(
  auth: ReturnType<typeof useConvexContext>['auth'],
): void {
  const next = resolveConvexAuthState({
    authProviderLoading: auth.providerLoading.value,
    authProviderAuthenticated: auth.providerAuthenticated.value,
    isConvexAuthenticated: auth.isConvexAuthenticated.value,
    isRefreshing: auth.isRefreshingRaw.value,
  })
  auth.isLoading.value = next.isLoading
  auth.isAuthenticated.value = next.isAuthenticated
  auth.isRefreshing.value = next.isRefreshing
}
