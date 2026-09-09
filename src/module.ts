import {
  addImports,
  addPlugin,
  addServerImports,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import { defu } from 'defu'
import { resolveAuthCookieName } from './runtime/utils/authStorage'

export interface ModuleAuthOptions {
  /**
   * Opt-in first-party Convex Auth (`@convex-dev/auth`) client.
   *
   * When set to `'convex-auth'`, the module registers a client plugin that
   * hydrates tokens, handles OAuth `?code=` callbacks, and wires
   * `useConvexAuth({ fetchToken })`. It also auto-imports `useAuth`,
   * `signIn`, and `signOut` so apps only need forms.
   *
   * Omit for bring-your-own providers (Clerk, Auth0, custom) — wire
   * `useConvexAuth({ fetchToken })` yourself.
   */
  provider?: 'convex-auth'
  /**
   * Cookie name whose value is a JWT used for authenticated SSR queries.
   * When set, the server plugin reads this cookie into `ctx.ssrToken` and
   * `useConvexQuery` falls back to it when `options.token` is omitted.
   * `useAuth` / `useConvexAuth` expose the presence of this cookie as
   * `hasSsrSession`.
   * Nitro `fetch*` helpers also read this cookie when `{ event }` is passed.
   *
   * Defaults to `'convex_jwt'` when `provider === 'convex-auth'`.
   * Otherwise off — BYO apps must opt in and write the JWT after sign-in.
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
   * Run Convex queries during SSR (`useAsyncData` on the server).
   * Per-call `useConvexQuery(..., { server })` overrides this default.
   * @default true
   */
  server?: boolean
  /**
   * Optional auth: SSR cookie and/or first-party Convex Auth provider.
   */
  auth?: ModuleAuthOptions
}

export type {
  UseAuthReturn,
  SignInResult,
  AuthTokens,
} from './runtime/composables/useAuth'

export interface ModulePublicRuntimeConfig {
  convex: {
    url?: string
    server?: boolean
    auth?: ModuleAuthOptions
  }
}

export type {
  ConvexQueryArgs,
  UseConvexQueryOptions,
  UseConvexQueryReturn,
} from './runtime/composables/useConvexQuery'
export type {
  UseConvexAuthSetupOptions,
  UseConvexAuthReturn,
  AuthTokenFetcher,
} from './runtime/composables/useConvexAuth'
export type { ConvexFetchOptions } from './runtime/server/fetch'
export type { ConvexNuxtContext, ConvexAuthContext } from './runtime/utils/context'

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

    const auth = options.auth
      ? {
          ...options.auth,
          cookie: resolveAuthCookieName(options.auth) ?? options.auth.cookie,
        }
      : options.auth

    nuxt.options.runtimeConfig.public.convex = defu(existing ?? {}, {
      url: options.url,
      server: options.server,
      auth,
    })

    const resolver = createResolver(import.meta.url)
    const useConvexAuthProvider = auth?.provider === 'convex-auth'

    addPlugin({
      src: resolver.resolve('./runtime/plugin.server'),
      mode: 'server',
    })
    addPlugin({
      src: resolver.resolve('./runtime/plugin.client'),
      mode: 'client',
    })

    if (useConvexAuthProvider) {
      addPlugin({
        src: resolver.resolve('./runtime/plugin.auth.client'),
        mode: 'client',
      })
    }

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
      ...(useConvexAuthProvider
        ? [
            {
              name: 'useAuth',
              from: resolver.resolve('./runtime/composables/useAuth'),
            },
            {
              name: 'signIn',
              from: resolver.resolve('./runtime/composables/useAuth'),
            },
            {
              name: 'signOut',
              from: resolver.resolve('./runtime/composables/useAuth'),
            },
          ]
        : []),
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

    const contextTypes = resolver.resolve('./runtime/utils/context')
    addTypeTemplate({
      filename: 'types/convex-nuxt.d.ts',
      getContents: () => `// Generated by @convex/nuxt
import type { ConvexNuxtContext } from '${contextTypes}'

declare module '@nuxt/schema' {
  interface PublicRuntimeConfig {
    convex: {
      url?: string
      server?: boolean
      auth?: {
        provider?: 'convex-auth'
        cookie?: string
      }
    }
  }
}

declare module 'nuxt/app' {
  interface NuxtApp {
    $convex: ConvexNuxtContext
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $convex: ConvexNuxtContext
  }
}

export {}
`,
    })
  },
})
