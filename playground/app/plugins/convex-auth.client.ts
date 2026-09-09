/**
 * Wire ConvexClient.setAuth before page subscriptions mount.
 */
export default defineNuxtPlugin({
  name: 'playground-convex-auth',
  dependsOn: ['convex-nuxt'],
  setup() {
    const {
      fetchToken,
      providerLoading,
      providerAuthenticated,
      hydrateFromStorage,
    } = usePlaygroundAuth()

    hydrateFromStorage()

    useConvexAuth({
      fetchToken,
      isLoading: providerLoading,
      isAuthenticated: providerAuthenticated,
    })
  },
})
