import ConvexModule from '../../../src/module'

export default defineNuxtConfig({
  ssr: true,
  modules: [ConvexModule],
  convex: {
    // Intentionally empty — plugins must no-op without throwing.
    url: undefined,
    auth: {
      provider: 'convex-auth',
    },
  },
})
