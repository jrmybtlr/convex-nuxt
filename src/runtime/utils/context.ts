import type { AuthTokenFetcher, ConvexClient, ConvexHttpClient } from 'convex/browser'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import { inject, ref } from 'vue'
import { useNuxtApp } from 'nuxt/app'

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
   * JWT from the optional auth cookie. Reactive so sign-in/out updates
   * HttpClient refreshes and `hasSsrSession`.
   */
  ssrToken: ComputedRef<string | undefined>
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

/**
 * Resolve Convex context from Nuxt `$convex` provide and/or Vue inject.
 *
 * Prefer `$convex` so async plugins can still read context after `await`
 * (Vue `inject()` only works synchronously inside setup).
 */
export function tryUseConvexContext(): ConvexNuxtContext | null {
  try {
    const app = useNuxtApp()
    const fromNuxt = app.$convex as ConvexNuxtContext | undefined
    if (fromNuxt) {
      return fromNuxt
    }
  }
  catch {
    // Not in a Nuxt app context.
  }

  try {
    return inject(convexNuxtKey, null)
  }
  catch {
    return null
  }
}

export function useConvexContext(): ConvexNuxtContext {
  const ctx = tryUseConvexContext()
  if (!ctx) {
    throw new Error(
      '[convex-nuxt] Convex plugin did not start — set convex.url or NUXT_PUBLIC_CONVEX_URL (the module no-ops when the URL is empty).',
    )
  }
  return ctx
}
