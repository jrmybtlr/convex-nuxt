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
import { isConvexAuth, resolveAuthMode, resolveAuthRoutes } from './runtime/utils/authStorage'
import { suggestedCloudUrlFromMismatch } from './runtime/utils/convexDashboard'
import { warnStaleLocalConvexUrl } from './runtime/utils/errors'

export interface ModuleAuthOptions {
  /**
   * Opt-in first-party Convex Auth v2 (`@convex-dev/auth@^2`).
   *
   * Registers a client plugin built on `AuthClient` from
   * `@convex-dev/auth/browser` (session restore, refresh, cross-tab sync,
   * OAuth callbacks, server-side revocation), auto-imports `useAuth`,
   * `useConvexSignIn`, `useOAuth`, `useOAuthSignIn` and `signOut`, and in
   * SSR mode mounts the auth routes from `@convex-dev/auth/ssr` in Nitro.
   *
   * Omit for bring-your-own providers (Clerk, Auth0, custom) — wire
   * `useConvexAuth({ fetchToken })` yourself.
   */
  provider?: 'convex-auth'
  /**
   * Convex Auth session model.
   *
   * - `'ssr'` (default): the refresh token lives in an httpOnly cookie set by
   *   Nitro; sign-ins go through the auth proxy route; SSR renders
   *   authenticated. Requires {@link signIn}.
   * - `'spa'`: tokens live in browser storage and sign-ins go straight to
   *   Convex. SSR renders signed out.
   *
   * @default 'ssr'
   */
  mode?: 'ssr' | 'spa'
  /**
   * Names of the session functions exported from your Convex auth file
   * (the result of `setupConvexAuth`).
   *
   * @default { refreshSession: 'auth:refreshSession', signOut: 'auth:signOut', isAuthenticated: 'auth:isAuthenticated' }
   */
  api?: {
    refreshSession?: string
    signOut?: string
    isAuthenticated?: string
  }
  /**
   * SSR mode: every Convex function that can issue a session (sign-in,
   * sign-up, OAuth `completeSignIn*`, …), e.g.
   * `['auth:signInWithUsernamePassword', 'auth:signUpWithUsernamePassword']`.
   * The auth proxy refuses anything not listed. Stored in private runtime
   * config (`runtimeConfig.convexAuth.signIn`).
   */
  signIn?: string[]
  /**
   * SSR mode: path prefix for the Nitro auth routes
   * (`<prefix>/signin`, `<prefix>/refresh`, `<prefix>/signout`).
   * @default '/api/convex/auth'
   */
  routePrefix?: string
  /**
   * SSR mode: origins trusted by the auth routes' CSRF check besides the
   * request's own Host (e.g. behind a proxy that rewrites Host).
   */
  allowedOrigins?: string[]
  /**
   * SSR mode: auth cookie attributes. `httpOnly`, `sameSite` and lifetimes
   * are fixed by Convex Auth. `secure` defaults to true except on localhost.
   */
  cookieOptions?: { secure?: boolean; domain?: string; path?: string }
  /**
   * Namespace for token storage keys. Non-alphanumeric characters are
   * ignored. Defaults to the deployment URL.
   */
  storageNamespace?: string
  /**
   * Client token storage. `'localStorage'` (default) or `'inMemory'`.
   * For a custom TokenStorage, call `configureConvexAuth({ storage })` from a
   * client plugin with `enforce: 'pre'`.
   * @default 'localStorage'
   */
  storage?: 'localStorage' | 'inMemory'
  /** Log Convex Auth refresh / lifecycle steps to the console. */
  verbose?: boolean
  /**
   * BYO providers only: cookie whose value is a JWT used for authenticated
   * SSR queries and Nitro `fetch*` helpers. The app writes it after sign-in.
   * Ignored with `provider: 'convex-auth'`.
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
   * Options forwarded to `new ConvexClient(url, client)`.
   * Useful for `unsavedChangesWarning`, `verbose`, custom WebSocket, etc.
   */
  client?: import('convex/browser').ConvexClientOptions
  /**
   * Optional auth: SSR cookie and/or first-party Convex Auth provider.
   */
  auth?: ModuleAuthOptions
}

export type {
  UseAuthReturn,
  ConvexAuthSession,
  ConvexSignInResult,
  OAuthCompleteResult,
  OAuthFlowError,
  OAuthProviderRefs,
  OAuthSignInOptions,
  OAuthStartResult,
} from './runtime/composables/useAuth'

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
  UseConvexQueriesOptions,
} from './runtime/composables/useConvexQueries'
export type { ConvexFetchOptions } from './runtime/server/fetch'
export type { ConvexRef } from './runtime/utils/functionReference'
export type { ConvexNuxtContext, ConvexAuthContext } from './runtime/utils/context'
export type { ConnectionState } from './runtime/composables/useConvexConnectionState'
export type { ConvexGate } from './runtime/composables/useConvexGate'
export type {
  ConvexAuthClientOptions,
  ConvexAuthTokenStorage,
  ConvexAuthStorageMode,
  ConvexAmbientSignIn,
} from './runtime/utils/authClientOptions'
export type { ConvexAuthServerRuntimeConfig } from './runtime/utils/authStorage'
export { configureConvexAuth } from './runtime/utils/authClientOptions'

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

    // Server-only auth options stay out of the public runtime config.
    const {
      signIn: authSignIn,
      allowedOrigins: authAllowedOrigins,
      cookieOptions: authCookieOptions,
      ...publicAuth
    } = options.auth ?? {}
    const auth = options.auth ? publicAuth : undefined

    if (auth && isConvexAuth(auth)) {
      for (const legacy of ['httpOnly', 'presentCookie', 'shouldHandleCode'] as const) {
        if (legacy in (auth as Record<string, unknown>)) {
          console.warn(
            `[use-convex] convex.auth.${legacy} was removed with Convex Auth v2 support. ` +
              'See the README migration notes.',
          )
        }
      }
      if (resolveAuthMode(auth) === 'ssr' && !authSignIn?.length) {
        console.warn(
          '[use-convex] convex.auth.signIn is empty: the SSR auth proxy will refuse every ' +
            "sign-in. List your session-issuing functions, e.g. ['auth:signInWithUsernamePassword'].",
        )
      }
    }

    nuxt.options.runtimeConfig.convexAuth = defu(
      (nuxt.options.runtimeConfig as { convexAuth?: Record<string, unknown> }).convexAuth ?? {},
      {
        signIn: authSignIn ?? [],
        allowedOrigins: authAllowedOrigins ?? [],
        cookie: authCookieOptions ?? {},
      },
    )

    nuxt.options.runtimeConfig.public.convex = defu(existing ?? {}, {
      url: options.url,
      server: options.server,
      client: options.client,
      auth,
    })

    // Private DevTools credentials — never public. Defaults from Convex CLI env;
    // Nitro inlines runtimeConfig so bare process.env.CONVEX_* is unreliable.
    if (nuxt.options.dev) {
      const publicUrl =
        (nuxt.options.runtimeConfig.public.convex as { url?: string } | undefined)?.url ?? ''
      const suggestedCloudUrl = suggestedCloudUrlFromMismatch(
        publicUrl,
        process.env.CONVEX_DEPLOYMENT,
      )
      if (suggestedCloudUrl) {
        warnStaleLocalConvexUrl(publicUrl, suggestedCloudUrl)
      }

      nuxt.options.runtimeConfig.convexDevtools = defu(
        (nuxt.options.runtimeConfig as { convexDevtools?: Record<string, string> })
          .convexDevtools ?? {},
        {
          deployKey: process.env.CONVEX_DEPLOY_KEY ?? '',
          deployment: process.env.CONVEX_DEPLOYMENT ?? '',
          // Fallback when public.convex.url was empty at config eval time.
          url: process.env.NUXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? '',
        },
      )
    }

    const resolver = createResolver(import.meta.url)
    const runtimeDir = resolver.resolve('./runtime')
    const useConvexAuthProvider = isConvexAuth(auth)
    const useSsrConvexAuth = useConvexAuthProvider && resolveAuthMode(auth) === 'ssr'

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

    if (useSsrConvexAuth) {
      const routes = resolveAuthRoutes(auth)
      for (const [route, file] of [
        [routes.signIn, 'signin'],
        [routes.refresh, 'refresh'],
        [routes.signOut, 'signout'],
      ] as const) {
        addServerHandler({
          route,
          method: 'post',
          handler: resolver.resolve(`./runtime/server/convexAuth/${file}`),
        })
      }
      addServerHandler({
        middleware: true,
        handler: resolver.resolve('./runtime/server/convexAuth/session.middleware'),
      })
    }
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
              name: 'useConvexSignIn',
              from: resolver.resolve('./runtime/composables/useAuth'),
            },
            {
              name: 'useOAuth',
              from: resolver.resolve('./runtime/composables/useAuth'),
            },
            {
              name: 'useOAuthSignIn',
              from: resolver.resolve('./runtime/composables/useAuth'),
            },
            {
              name: 'convexOAuth',
              from: resolver.resolve('./runtime/auth/oauth'),
            },
            {
              name: 'signOut',
              from: resolver.resolve('./runtime/composables/useAuth'),
            },
            {
              name: 'configureConvexAuth',
              from: resolver.resolve('./runtime/utils/authClientOptions'),
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
    const authTypes = resolver.resolve('./runtime/utils/authStorage')
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
      auth?: import('${authTypes}').ConvexAuthConfig
    }
  }
  interface RuntimeConfig {
    convexAuth: import('${authTypes}').ConvexAuthServerRuntimeConfig
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
