import { defineNuxtPlugin, useRequestEvent, useRuntimeConfig } from 'nuxt/app'
import { useConvexAuthTokenState, useSsrTokenRef } from './utils/authCookie'
import { isSsrConvexAuth, type ConvexAuthConfig } from './utils/authStorage'
import { createHttpClient } from './utils/http'
import { convexNuxtKey, createAuthContext, type ConvexNuxtContext } from './utils/context'
import { warnMissingConvexUrl } from './utils/errors'

export default defineNuxtPlugin({
  name: 'convex-nuxt-server',
  setup(nuxtApp) {
    const config = useRuntimeConfig()
    const convexConfig = config.public.convex as
      | { url?: string; auth?: ConvexAuthConfig }
      | undefined
    const url = convexConfig?.url

    if (!url) {
      if (import.meta.dev) {
        warnMissingConvexUrl('server')
      }
      return
    }

    if (isSsrConvexAuth(convexConfig?.auth)) {
      // The Nitro session middleware refreshed the access token (or found
      // no session) before rendering. Hand it to the client payload so the
      // AuthClient adopts it as `initialAccessToken`.
      const event = useRequestEvent()
      const token = (event?.context as { convexAuthToken?: string | null } | undefined)
        ?.convexAuthToken
      useConvexAuthTokenState().value = token ?? null
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
