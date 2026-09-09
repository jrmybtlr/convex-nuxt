import ConvexModule from '../../../src/module'

export default defineNuxtConfig({
  ssr: true,
  modules: [ConvexModule],
  convex: {
    url: 'https://example.convex.cloud',
    server: true,
    auth: {
      provider: 'convex-auth',
    },
  },
})
