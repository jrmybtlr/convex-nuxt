import type { AuthTokenFetcher, ConvexClient, ConvexHttpClient } from 'convex/browser'
import type { FunctionReference } from 'convex/server'
import type { ComputedRef, InjectionKey, Ref, ShallowRef } from 'vue'
import { inject, ref } from 'vue'
import { useNuxtApp } from 'nuxt/app'
import { missingConvexUrlError } from './errors'
import type { CreateHttpClientOptions } from './http'

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

/** Snapshot of the Convex Auth client (`AuthState` in `@convex-dev/auth`). */
export interface ConvexAuthSnapshot {
  isLoading: boolean
  isAuthenticated: boolean
  token: string | null
}

/**
 * Runs a method's sign-in function. Direct to the deployment in SPA mode,
 * through the Nitro auth proxy in SSR mode (which moves the refresh token
 * into an httpOnly cookie).
 */
export interface ConvexAuthSignInApi {
  mutation: (fn: FunctionReference<'mutation'>, args: Record<string, unknown>) => Promise<any>
  action: (fn: FunctionReference<'action'>, args: Record<string, unknown>) => Promise<any>
}

/** First-party Convex Auth v2 binding, set by the auth client plugin. */
export interface ConvexAuthBinding {
  mode: 'ssr' | 'spa'
  state: ShallowRef<ConvexAuthSnapshot>
  signInApi: ConvexAuthSignInApi
  /** Adopt a session returned by a method's sign-in function. */
  setSession: (session: {
    accessToken: string
    userId: string
    [key: string]: unknown
  }) => Promise<void>
  signOut: () => Promise<void>
  /** Values an ambient sign-in (e.g. OAuth) publishes, read reactively. */
  ambientValue: <T>(id: string, key: string) => Readonly<Ref<T | undefined>>
}

export interface ConvexNuxtContext {
  url: string
  /**
   * Live WebSocket client. Only available in the browser plugin.
   */
  client: ConvexClient | null
  /**
   * JWT for HttpClient snapshots: the SSR session token (Convex Auth SSR
   * mode or a BYO cookie), then the live Convex Auth access token on the
   * client. Reactive so sign-in/out re-runs HttpClient fetches.
   */
  ssrToken: ComputedRef<string | undefined>
  /**
   * Shared auth state for useConvexAuth.
   */
  auth: ConvexAuthContext
  /**
   * Convex Auth v2 client binding (`convex.auth.provider: 'convex-auth'`,
   * browser only). `null` on the server and for BYO providers.
   */
  convexAuth?: ConvexAuthBinding | null
  /**
   * Create a fresh HttpClient for one-shot fetches (SSR / Nitro / refresh).
   * Prefer a new client per call — HttpClient is stateful.
   */
  createHttpClient: (options?: CreateHttpClientOptions) => ConvexHttpClient
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
  } catch {
    // Not in a Nuxt app context.
  }

  try {
    return inject(convexNuxtKey, null)
  } catch {
    return null
  }
}

export function useConvexContext(): ConvexNuxtContext {
  const ctx = tryUseConvexContext()
  if (!ctx) {
    throw missingConvexUrlError(
      'Convex plugin did not start (the module no-ops when the URL is empty)',
    )
  }
  return ctx
}
