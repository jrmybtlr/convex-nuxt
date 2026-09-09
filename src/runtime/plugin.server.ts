import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app'
import { useSsrTokenRef } from './utils/authCookie'
import { createHttpClient } from './utils/http'
import {
  convexNuxtKey,
  createAuthContext,
  type ConvexNuxtContext,
} from './utils/context'

export default defineNuxtPlugin({
  name: 'convex-nuxt-server',
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

    const ssrToken = useSsrTokenRef()
    const auth = createAuthContext()
    // Opt-in cookie means this request can run authenticated SSR queries.
    // Mark the UI as authenticated so pages don't flash the signed-out gate.
    if (ssrToken.value) {
      auth.providerAuthenticated.value = true
      auth.isConvexAuthenticated.value = true
      auth.isLoading.value = false
      auth.isAuthenticated.value = true
    }

    const ctx: ConvexNuxtContext = {
      url,
      client: null,
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
