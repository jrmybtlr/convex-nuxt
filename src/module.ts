import {
  addImports,
  addPlugin,
  addServerImports,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import { defu } from 'defu'

export interface ModuleAuthOptions {
  /**
   * Cookie name whose value is a JWT used for authenticated SSR queries.
   * When set, the server plugin reads this cookie into `ctx.ssrToken` and
   * `useConvexQuery` falls back to it when `options.token` is omitted.
   *
   * Off by default — apps must opt in and write the JWT after sign-in.
   */
  cookie?: string
}

export interface ModuleOptions {
  /**
   * Convex deployment URL.
   *
   * Defaults to runtimeConfig.public.convex.url, allowing
   * NUXT_PUBLIC_CONVEX_URL to be changed without rebuilding.
   */
  url?: string
  /**
   * Disable Convex query execution during SSR.
   * @default true
   */
  server?: boolean
  /**
   * Optional auth helpers (SSR cookie token).
   */
  auth?: ModuleAuthOptions
}

export interface ModulePublicRuntimeConfig {
  convex: {
    url?: string
    server?: boolean
    auth?: ModuleAuthOptions
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@convex/nuxt',
    configKey: 'convex',
    compatibility: {
      nuxt: '^4.0.0',
    },
  },

  defaults: {
    url: undefined,
    server: true,
  },

  setup(options, nuxt) {
    const existing = nuxt.options.runtimeConfig.public.convex as
      | ModulePublicRuntimeConfig['convex']
      | undefined

    nuxt.options.runtimeConfig.public.convex = defu(existing ?? {}, {
      url: options.url,
      server: options.server,
      auth: options.auth,
    })

    const resolver = createResolver(import.meta.url)

    addPlugin({
      src: resolver.resolve('./runtime/plugin.server'),
      mode: 'server',
    })
    addPlugin({
      src: resolver.resolve('./runtime/plugin.client'),
      mode: 'client',
    })

    addImports([
      {
        name: 'useConvex',
        from: resolver.resolve('./runtime/composables/useConvex'),
      },
      {
        name: 'useConvexAuth',
        from: resolver.resolve('./runtime/composables/useConvexAuth'),
      },
      {
        name: 'useConvexQuery',
        from: resolver.resolve('./runtime/composables/useConvexQuery'),
      },
      {
        name: 'useConvexMutation',
        from: resolver.resolve('./runtime/composables/useConvexMutation'),
      },
      {
        name: 'useConvexAction',
        from: resolver.resolve('./runtime/composables/useConvexAction'),
      },
    ])

    addServerImports([
      {
        name: 'fetchQuery',
        from: resolver.resolve('./runtime/server/fetch'),
      },
      {
        name: 'fetchMutation',
        from: resolver.resolve('./runtime/server/fetch'),
      },
      {
        name: 'fetchAction',
        from: resolver.resolve('./runtime/server/fetch'),
      },
    ])
  },
})
