import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app'
import { useSsrTokenRef } from './utils/authCookie'
import { createHttpClient } from './utils/http'
import { convexNuxtKey, createAuthContext, type ConvexNuxtContext } from './utils/context'
import { warnMissingConvexUrl } from './utils/errors'

export default defineNuxtPlugin({
  name: 'convex-nuxt-server',
  setup(nuxtApp) {
    const config = useRuntimeConfig()
    const convexConfig = config.public.convex as
      | { url?: string; auth?: { provider?: string; cookie?: string } }
      | undefined
    const url = convexConfig?.url

    if (!url) {
      if (import.meta.dev) {
        warnMissingConvexUrl('server')
      }
      return
    }

    const ssrToken = useSsrTokenRef()
    const auth = createAuthContext()
    // Cookie present → SSR can run authenticated HttpClient queries and
    // `showAuthedUi` / `hasSsrSession` keep the shell mounted. Stamp
    // `isAuthenticated` only for this server request so `queryArgs` gated on
    // `isAuthenticated` still fetch during SSR; the client plugin does **not**
    // copy this — it waits for Convex confirmation (shell uses `showAuthedUi`).
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
