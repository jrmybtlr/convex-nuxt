import {
  addComponent,
  addImports,
  addPlugin,
  addServerHandler,
  addServerImports,
  addServerScanDir,
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
   * Defaults to `'convex_jwt'` when `provider === 'convex-auth'` and
   * `httpOnly` is off. With `httpOnly: true`, defaults to `__convexAuthJWT`.
   * Otherwise off — BYO apps must opt in and write the JWT after sign-in.
   */
  cookie?: string
  /**
   * Store JWT + refresh tokens in HttpOnly cookies via Nitro
   * (`/api/convex/auth/session`). Cookies are not readable via
   * `document.cookie`. Prefer `true` in production.
   *
   * Note: ConvexClient still needs the JWT in memory for the WebSocket;
   * the session route returns it only via same-origin POST `{ getToken: true }`.
   * HttpOnly mitigates cookie theft, not XSS session theft. The readable
   * presence cookie drives `hasSsrSession` / `showAuthedUi` (UI only — gate
   * private queries with `{ authenticated: true }`).
   *
   * @default false
   */
  httpOnly?: boolean
  /**
   * Readable presence cookie when `httpOnly` is enabled.
   * @default 'convex_auth_present'
   */
  presentCookie?: string
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
   * Options forwarded to `new ConvexClient(url, client)`.
   * Useful for `unsavedChangesWarning`, `verbose`, custom WebSocket, etc.
   */
  client?: import('convex/browser').ConvexClientOptions
  /**
   * Optional auth: SSR cookie and/or first-party Convex Auth provider.
   */
  auth?: ModuleAuthOptions
}

export type { UseAuthReturn, SignInResult, AuthTokens } from './runtime/composables/useAuth'

export interface ModulePublicRuntimeConfig {
  convex: {
    url?: string
    server?: boolean
    client?: import('convex/browser').ConvexClientOptions
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
export type {
  UseConvexMutationOptions,
  OptimisticUpdate,
} from './runtime/composables/useConvexMutation'
export type {
  UseConvexFileUploadOptions,
  ConvexFileUploadMeta,
  ConvexFileUploadExtraArgs,
} from './runtime/composables/useConvexFileUpload'
export type {
  ConvexR2UploadApi,
  ConvexR2UploadProgress,
} from './runtime/composables/useConvexR2Upload'
export type {
  PaginatedQueryReference,
  PaginatedQueryArgs,
  PaginatedQueryItem,
  UseConvexPaginatedQueryOptions,
  UseConvexPaginatedQueryReturn,
  PaginationStatus,
} from './runtime/composables/useConvexPaginatedQuery'
export type {
  ConvexQueryRequestEntry,
  ConvexQueriesRequest,
  ConvexQueriesResult,
} from './runtime/composables/useConvexQueries'
export type { ConvexFetchOptions } from './runtime/server/fetch'
export type { ConvexNuxtContext, ConvexAuthContext } from './runtime/utils/context'
export type { ConnectionState } from './runtime/composables/useConvexConnectionState'
export type { ConvexGate } from './runtime/composables/useConvexGate'

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'use-convex',
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
      client: options.client,
      auth,
    })

    const resolver = createResolver(import.meta.url)
    const runtimeDir = resolver.resolve('./runtime')
    const useConvexAuthProvider = auth?.provider === 'convex-auth'

    // Ensure Nitro can resolve module runtime handlers / imports.
    nuxt.options.build.transpile.push(runtimeDir)
    ;(
      nuxt.hooks as {
        hook: (
          name: string,
          fn: (nitroConfig: { externals?: { inline?: string[] | unknown } }) => void,
        ) => void
      }
    ).hook('nitro:config', (nitroConfig) => {
      nitroConfig.externals ||= {}
      nitroConfig.externals.inline ||= []
      if (Array.isArray(nitroConfig.externals.inline)) {
        nitroConfig.externals.inline.push(runtimeDir)
      }
    })

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

    if (nuxt.options.dev) {
      addPlugin({
        src: resolver.resolve('./runtime/plugin.devtools.client'),
        mode: 'client',
      })
    }

    for (const name of [
      'Authenticated',
      'Unauthenticated',
      'AuthLoading',
      'AuthRefreshing',
    ] as const) {
      addComponent({
        name,
        filePath: resolver.resolve(`./runtime/components/${name}.vue`),
      })
    }

    // Scan api/ + routes/ like a normal Nuxt server/ dir.
    addServerScanDir(resolver.resolve('./runtime/server'))

    // Also register explicitly — some Nuxt/Nitro versions drop scanned
    // handlers from published module packages during HMR.
    addServerHandler({
      route: '/api/convex/auth/session',
      handler: resolver.resolve('./runtime/server/api/convex/auth/session'),
    })
    if (nuxt.options.dev) {
      addServerHandler({
        route: '/__convex_devtools',
        handler: resolver.resolve('./runtime/server/routes/__convex_devtools.get'),
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
        name: 'useConvexGate',
        from: resolver.resolve('./runtime/composables/useConvexGate'),
      },
      {
        name: 'useConvexQuery',
        from: resolver.resolve('./runtime/composables/useConvexQuery'),
      },
      {
        name: 'useConvexQueries',
        from: resolver.resolve('./runtime/composables/useConvexQueries'),
      },
      {
        name: 'useConvexPaginatedQuery',
        from: resolver.resolve('./runtime/composables/useConvexPaginatedQuery'),
      },
      {
        name: 'useConvexMutation',
        from: resolver.resolve('./runtime/composables/useConvexMutation'),
      },
      {
        name: 'useConvexFileUpload',
        from: resolver.resolve('./runtime/composables/useConvexFileUpload'),
      },
      {
        name: 'useConvexR2Upload',
        from: resolver.resolve('./runtime/composables/useConvexR2Upload'),
      },
      {
        name: 'useConvexAction',
        from: resolver.resolve('./runtime/composables/useConvexAction'),
      },
      {
        name: 'useConvexConnectionState',
        from: resolver.resolve('./runtime/composables/useConvexConnectionState'),
      },
      {
        name: 'useAuthToken',
        from: resolver.resolve('./runtime/composables/useAuthToken'),
      },
      {
        name: 'requireConvexAuthMiddleware',
        from: resolver.resolve('./runtime/composables/useAuthToken'),
      },
      {
        name: 'prewarmQuery',
        from: resolver.resolve('./runtime/composables/prewarmQuery'),
      },
      {
        name: 'optimisticallyUpdateValueInPaginatedQuery',
        from: resolver.resolve('./runtime/utils/paginatedOptimistic'),
      },
      {
        name: 'insertAtTop',
        from: resolver.resolve('./runtime/utils/paginatedOptimistic'),
      },
      {
        name: 'insertAtBottomIfLoaded',
        from: resolver.resolve('./runtime/utils/paginatedOptimistic'),
      },
      {
        name: 'insertAtPosition',
        from: resolver.resolve('./runtime/utils/paginatedOptimistic'),
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
      {
        name: 'getConvexToken',
        from: resolver.resolve('./runtime/server/auth'),
      },
      {
        name: 'requireConvexAuth',
        from: resolver.resolve('./runtime/server/auth'),
      },
    ])

    if (nuxt.options.dev) {
      // DevTools hook is optional — typed loosely so builds work without
      // @nuxt/devtools as a hard dependency.
      ;(
        nuxt.hooks as {
          hook: (name: string, fn: (tabs: Array<Record<string, unknown>>) => void) => void
        }
      ).hook('devtools:customTabs', (tabs) => {
        tabs.push({
          name: 'convex-nuxt',
          title: 'Convex',
          icon: 'carbon:data-base',
          view: {
            type: 'iframe',
            src: '/__convex_devtools',
          },
        })
      })
    }

    const contextTypes = resolver.resolve('./runtime/utils/context')
    addTypeTemplate({
      filename: 'types/convex-nuxt.d.ts',
      getContents: () => `// Generated by use-convex
import type { ConvexNuxtContext } from '${contextTypes}'

declare module '@nuxt/schema' {
  interface PublicRuntimeConfig {
    convex: {
      url?: string
      server?: boolean
      client?: import('convex/browser').ConvexClientOptions
      auth?: {
        provider?: 'convex-auth'
        cookie?: string
        httpOnly?: boolean
        presentCookie?: string
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
