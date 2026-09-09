/**
 * Derive Convex auth UI state from provider + backend confirmation.
 * Mirrors convex/react ConvexAuthState.
 */
export interface ConvexAuthFlags {
  /**
   * Whether the auth provider is still resolving its initial session.
   * When true, Convex confirmation is ignored and we stay loading.
   */
  authProviderLoading: boolean
  /**
   * Whether the auth provider believes a user is signed in.
   */
  authProviderAuthenticated: boolean
  /**
   * Backend confirmation from ConvexClient.setAuth onChange.
   * `null` means we have not heard from Convex yet.
   */
  isConvexAuthenticated: boolean | null
  /**
   * Whether the socket is paused while fetching a replacement token
   * after a server rejection. Routine background rotation does not set this.
   */
  isRefreshing: boolean
}

export interface ConvexAuthState {
  isLoading: boolean
  isAuthenticated: boolean
  isRefreshing: boolean
}

export function resolveConvexAuthState(flags: ConvexAuthFlags): ConvexAuthState {
  const {
    authProviderLoading,
    authProviderAuthenticated,
    isConvexAuthenticated,
    isRefreshing,
  } = flags

  // Provider loading → stay loading (and reset confirmation upstream).
  if (authProviderLoading) {
    return {
      isLoading: true,
      isAuthenticated: false,
      isRefreshing: false,
    }
  }

  // Provider signed out → not authenticated, not loading.
  if (!authProviderAuthenticated) {
    return {
      isLoading: false,
      isAuthenticated: false,
      isRefreshing: false,
    }
  }

  // Provider signed in, waiting for Convex confirmation.
  if (isConvexAuthenticated === null) {
    return {
      isLoading: true,
      isAuthenticated: false,
      isRefreshing: false,
    }
  }

  const isAuthenticated = isConvexAuthenticated
  return {
    isLoading: false,
    isAuthenticated,
    isRefreshing: isRefreshing && isAuthenticated,
  }
}
