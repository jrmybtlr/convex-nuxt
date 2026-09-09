import { ConvexClient } from 'convex/browser'
import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app'
import { useSsrTokenRef } from './utils/authCookie'
import { createHttpClient } from './utils/http'
import {
  convexNuxtKey,
  createAuthContext,
  type ConvexNuxtContext,
} from './utils/context'

export default defineNuxtPlugin({
  name: 'convex-nuxt-client',
  setup(nuxtApp) {
    const config = useRuntimeConfig()
    const convexConfig = config.public.convex as
      | { url?: string, auth?: { provider?: string, cookie?: string } }
      | undefined
    const url = convexConfig?.url

    if (!url) {
      if (import.meta.dev) {
        console.warn(
          '[convex-nuxt] No Convex URL configured. Set convex.url or NUXT_PUBLIC_CONVEX_URL.',
        )
      }
      return
    }

    const client = new ConvexClient(url)

    // Mirror the SSR cookie onto HttpClient refreshes (Refresh button, watch).
    const ssrToken = useSsrTokenRef()
    const auth = createAuthContext()
    // Match server first paint: cookie means the authed shell can mount via
    // `showAuthedUi` / `hasSsrSession`. Do **not** stamp `isAuthenticated` —
    // that stays false until Convex confirms (or convex-auth wires setAuth).
    // Server plugin may set isAuthenticated for SSR queryArgs; client must
    // not, or hydration diverges once the auth plugin resets confirmation.

    const ctx: ConvexNuxtContext = {
      url,
      client,
      ssrToken,
      auth,
      createHttpClient: (options) => createHttpClient(url, options),
    }

    nuxtApp.vueApp.provide(convexNuxtKey, ctx)

    return {
      provide: {
        convex: ctx,
      },
    }
  },
})
