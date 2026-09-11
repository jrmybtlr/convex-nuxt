import { computed, type ComputedRef } from 'vue'
import { useConvexAuth } from '../composables/useConvexAuth'

export interface ConvexGate {
  isLoading: ComputedRef<boolean>
  isAuthenticated: ComputedRef<boolean>
  isRefreshing: ComputedRef<boolean>
  hasSsrSession: ComputedRef<boolean>
  showAuthedUi: ComputedRef<boolean>
  /** True while resolving auth and the authed shell is not yet shown. */
  showLoading: ComputedRef<boolean>
  /** True when signed out (no cookie, not authenticated, not loading). */
  showSignedOut: ComputedRef<boolean>
  /** True while refreshing a rejected token for an authenticated session. */
  showRefreshing: ComputedRef<boolean>
}

/**
 * Convenience gate flags for auth UI. Same values as the
 * `Authenticated` / `Unauthenticated` / `AuthLoading` / `AuthRefreshing`
 * components.
 */
export function useConvexGate(): ConvexGate {
  const auth = useConvexAuth()
  return {
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
    isRefreshing: auth.isRefreshing,
    hasSsrSession: auth.hasSsrSession,
    showAuthedUi: auth.showAuthedUi,
    showLoading: computed(() => auth.isLoading.value && !auth.showAuthedUi.value),
    showSignedOut: computed(() => !auth.showAuthedUi.value && !auth.isLoading.value),
    showRefreshing: computed(() => auth.isAuthenticated.value && auth.isRefreshing.value),
  }
}
