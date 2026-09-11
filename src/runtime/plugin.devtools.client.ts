import { defineNuxtPlugin } from 'nuxt/app'
import { useConvexConnectionState } from './composables/useConvexConnectionState'
import { tryUseConvexContext } from './utils/context'

export interface ConvexDevtoolsBridge {
  connection: ReturnType<typeof useConvexConnectionState>
  /** Auth UI / Convex confirmation flags (dev inspection only). */
  auth: {
    configured: boolean
    isLoading: boolean
    isAuthenticated: boolean
    isRefreshing: boolean
    isConvexAuthenticated: boolean | null
    hasSsrToken: boolean
  }
}

/**
 * Expose connection + auth snapshot on `window.__CONVEX_NUXT__` in development
 * for quick inspection alongside the DevTools iframe tab.
 */
export default defineNuxtPlugin({
  name: 'convex-nuxt-devtools',
  setup() {
    const ctx = tryUseConvexContext()
    if (!import.meta.dev || !ctx) {
      return
    }

    const connection = useConvexConnectionState()
    if (typeof window === 'undefined') {
      return
    }

    const bridge: ConvexDevtoolsBridge = {
      connection,
      get auth() {
        return {
          configured: ctx.auth.configured,
          isLoading: ctx.auth.isLoading.value,
          isAuthenticated: ctx.auth.isAuthenticated.value,
          isRefreshing: ctx.auth.isRefreshing.value,
          isConvexAuthenticated: ctx.auth.isConvexAuthenticated.value,
          hasSsrToken: Boolean(ctx.ssrToken.value),
        }
      },
    }

    ;(window as Window & { __CONVEX_NUXT__?: ConvexDevtoolsBridge }).__CONVEX_NUXT__ = bridge
  },
})
