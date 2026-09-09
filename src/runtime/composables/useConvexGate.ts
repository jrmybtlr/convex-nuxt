import { computed, type ComputedRef } from 'vue'
import { useConvexAuth } from '../composables/useConvexAuth'

export interface ConvexGate {
  isLoading: ComputedRef<boolean>
  isAuthenticated: ComputedRef<boolean>
  hasSsrSession: ComputedRef<boolean>
  showAuthedUi: ComputedRef<boolean>
  /** True while resolving auth and the shell is not yet shown. */
  showLoading: ComputedRef<boolean>
  /** True when signed out (no cookie, not authenticated, not loading). */
  showSignedOut: ComputedRef<boolean>
}

/**
 * Convenience gate flags for auth UI. Same values as the
 * `Authenticated` / `Unauthenticated` / `AuthLoading` components.
 */
export function useConvexGate(): ConvexGate {
  const auth = useConvexAuth()
  return {
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
    hasSsrSession: auth.hasSsrSession,
    showAuthedUi: auth.showAuthedUi,
    showLoading: computed(
      () => auth.isLoading.value && !auth.showAuthedUi.value,
    ),
    showSignedOut: computed(
      () => !auth.showAuthedUi.value && !auth.isLoading.value,
    ),
  }
}
