import type { AuthTokenFetcher, ConvexClient, ConvexHttpClient } from 'convex/browser'
import type { InjectionKey, Ref } from 'vue'
import { inject, ref } from 'vue'

export interface ConvexAuthContext {
  /**
   * Whether useConvexAuth({ fetchToken }) has been called.
   */
  configured: boolean
  fetchToken: AuthTokenFetcher | null
  providerLoading: Ref<boolean>
  providerAuthenticated: Ref<boolean>
  /**
   * Backend confirmation. `null` = waiting for Convex onChange.
   */
  isConvexAuthenticated: Ref<boolean | null>
  isRefreshingRaw: Ref<boolean>
  /** Derived UI flags (written by useConvexAuth). */
  isLoading: Ref<boolean>
  isAuthenticated: Ref<boolean>
  isRefreshing: Ref<boolean>
}

export interface ConvexNuxtContext {
  url: string
  /**
   * Live WebSocket client. Only available in the browser plugin.
   */
  client: ConvexClient | null
  /**
   * JWT from an optional auth cookie, available during SSR.
   */
  ssrToken: string | undefined
  /**
   * Shared auth state for useConvexAuth.
   */
  auth: ConvexAuthContext
  /**
   * Create a fresh HttpClient for one-shot fetches (SSR / Nitro / refresh).
   * Prefer a new client per call — HttpClient is stateful.
   */
  createHttpClient: (options?: { token?: string }) => ConvexHttpClient
}

export const convexNuxtKey: InjectionKey<ConvexNuxtContext> = Symbol('convex-nuxt')

export function createAuthContext(): ConvexAuthContext {
  return {
    configured: false,
    fetchToken: null,
    providerLoading: ref(false),
    providerAuthenticated: ref(false),
    isConvexAuthenticated: ref(null),
    isRefreshingRaw: ref(false),
    // Default: no auth wired → not loading, not authenticated.
    isLoading: ref(false),
    isAuthenticated: ref(false),
    isRefreshing: ref(false),
  }
}

export function useConvexContext(): ConvexNuxtContext {
  const ctx = inject(convexNuxtKey, null)
  if (!ctx) {
    throw new Error(
      '[convex-nuxt] Convex is not configured. Set convex.url or NUXT_PUBLIC_CONVEX_URL.',
    )
  }
  return ctx
}
