import { defineNuxtPlugin } from 'nuxt/app'
import { useConvexConnectionState } from './composables/useConvexConnectionState'
import { tryUseConvexContext } from './utils/context'

/**
 * Expose connection state on `window.__CONVEX_NUXT__` in development for
 * quick inspection alongside the DevTools iframe tab.
 */
export default defineNuxtPlugin({
  name: 'convex-nuxt-devtools',
  setup() {
    if (!import.meta.dev || !tryUseConvexContext()) {
      return
    }

    const connection = useConvexConnectionState()
    if (typeof window !== 'undefined') {
      ;(window as Window & {
        __CONVEX_NUXT__?: { connection: typeof connection }
      }).__CONVEX_NUXT__ = { connection }
    }
  },
})
