import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app'
import { useConvexAuth } from './composables/useConvexAuth'
import {
  consumeOAuthCodeFromUrl,
  getAuthToken,
  hasPendingOAuthCallback,
  hydrateAuthFromStorage,
  useAuthProviderState,
} from './composables/useAuth'
import { tryUseConvexContext } from './utils/context'

/**
 * First-party Convex Auth wiring (opt-in via `convex.auth.provider: 'convex-auth'`).
 *
 * Must stay synchronous through `useConvexAuth` / `inject` — awaiting first
 * drops Vue setup context and caused the "plugin did not start" 500.
 */
export default defineNuxtPlugin({
  name: 'convex-nuxt-auth',
  dependsOn: ['convex-nuxt-client'],
  setup() {
    const config = useRuntimeConfig()
    const convexConfig = config.public.convex as { url?: string } | undefined
    if (!convexConfig?.url) {
      return
    }

    // Client plugin no-ops when URL is empty; don't throw during HMR races.
    if (!tryUseConvexContext()) {
      return
    }

    const pendingOAuth = hasPendingOAuthCallback()
    if (!pendingOAuth) {
      hydrateAuthFromStorage()
    }

    const { isLoading, hasSession } = useAuthProviderState()

    useConvexAuth({
      fetchToken: ({ forceRefreshToken }) =>
        getAuthToken({ forceRefreshToken }),
      isLoading,
      isAuthenticated: hasSession,
    })

    // OAuth code exchange is async — run after setAuth is wired. Session
    // flags update reactively when tokens land.
    if (pendingOAuth) {
      void consumeOAuthCodeFromUrl().then((ok) => {
        if (!ok) {
          hydrateAuthFromStorage()
        }
      })
    }
  },
})
