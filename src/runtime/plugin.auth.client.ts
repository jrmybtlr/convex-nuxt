import { AuthClient, InMemoryStorage, defaultStorage } from '@convex-dev/auth/browser'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference, type FunctionReference } from 'convex/server'
import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app'
import { readonly, shallowRef, watch, type Ref } from 'vue'
import { useConvexAuth } from './composables/useConvexAuth'
import {
  OAUTH_CODE_PARAM,
  OAUTH_ERROR_PARAM,
  convexOAuth,
  type AmbientSignInClient,
} from './auth/oauth'
import { postAuth } from './auth/sessionRoutes'
import { getConvexAuthClientOptions } from './utils/authClientOptions'
import { useConvexAuthTokenState } from './utils/authCookie'
import {
  isConvexAuth,
  resolveAuthApiNames,
  resolveAuthMode,
  resolveAuthRoutes,
  type ConvexAuthConfig,
} from './utils/authStorage'
import {
  tryUseConvexContext,
  type ConvexAuthBinding,
  type ConvexAuthSignInApi,
} from './utils/context'

function sessionStorageOrUndefined(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : undefined
  } catch {
    return undefined
  }
}

/**
 * First-party Convex Auth v2 wiring (`convex.auth.provider: 'convex-auth'`).
 *
 * Builds an `AuthClient` from `@convex-dev/auth/browser` in SSR mode (refresh
 * token in an httpOnly cookie, sign-ins through the Nitro auth proxy) or SPA
 * mode (tokens in browser storage, sign-ins straight to the deployment),
 * then hands its token to `useConvexAuth` and watches `isAuthenticated` so a
 * session revoked server-side signs the client out.
 *
 * Setup stays synchronous so `useConvexAuth` keeps the Nuxt app context.
 */
export default defineNuxtPlugin({
  name: 'convex-nuxt-auth',
  dependsOn: ['convex-nuxt-client'],
  setup(nuxtApp) {
    const config = useRuntimeConfig()
    const convexConfig = config.public.convex as
      | { url?: string; auth?: ConvexAuthConfig }
      | undefined
    const auth = convexConfig?.auth
    if (!convexConfig?.url || !isConvexAuth(auth)) {
      return
    }

    // Client plugin no-ops when URL is empty; don't throw during HMR races.
    const ctx = tryUseConvexContext()
    const convex = ctx?.client
    if (!ctx || !convex) {
      return
    }

    const mode = resolveAuthMode(auth)
    const apiNames = resolveAuthApiNames(auth)
    const baseURL = (config.app as { baseURL?: string } | undefined)?.baseURL ?? '/'
    const routes = resolveAuthRoutes(auth)
    const route = (path: string) => baseURL.replace(/\/+$/, '') + path
    const options = getConvexAuthClientOptions()
    const tokenState = useConvexAuthTokenState()

    const storage =
      options.storage ?? (auth?.storage === 'inMemory' ? new InMemoryStorage() : defaultStorage())
    const storageNamespace = auth?.storageNamespace ?? ctx.url

    const replaceUrl =
      options.replaceUrl ??
      ((url: string) => {
        window.history.replaceState(window.history.state, '', url)
        // vue-router keeps its own copy of the query; drop the callback
        // params there too once the initial navigation has settled.
        const router = nuxtApp.$router as
          | {
              isReady: () => Promise<void>
              currentRoute: Ref<{ query: Record<string, unknown>; hash: string; path: string }>
              replace: (to: unknown) => Promise<unknown>
            }
          | undefined
        void router?.isReady().then(() => {
          const current = router.currentRoute.value
          if (!(OAUTH_CODE_PARAM in current.query) && !(OAUTH_ERROR_PARAM in current.query)) {
            return
          }
          const query = { ...current.query }
          delete query[OAUTH_CODE_PARAM]
          delete query[OAUTH_ERROR_PARAM]
          void router.replace({ path: current.path, query, hash: current.hash })
        })
      })

    // In-memory tokens don't survive the provider redirect, so keep the
    // pending OAuth flow in sessionStorage (same tab, cleared on close).
    const flowStorage =
      !options.storage && auth?.storage === 'inMemory' ? sessionStorageOrUndefined() : undefined
    const signIns = (options.ambientSignIns as AmbientSignInClient[] | undefined) ?? [
      convexOAuth(flowStorage ? { flowStorage, namespace: storageNamespace } : {}),
    ]
    const convexMutationApi = {
      mutation: (fn: FunctionReference<'mutation'>, args: Record<string, unknown>) =>
        convex.mutation(fn, args),
    }

    let authClient: AuthClient
    let signInApi: ConvexAuthSignInApi

    if (mode === 'ssr') {
      // The auth proxy speaks the ConvexHttpClient wire format, so a real
      // client aimed at it keeps Convex value encoding and ConvexError data.
      // The trailing `?path=` makes the appended endpoint a query param.
      const proxy = new ConvexHttpClient(`${route(routes.signIn)}?path=`, {
        skipConvexDeploymentUrlCheck: true,
      })
      const withAuth = () => {
        const token = authClient.getAccessToken()
        if (token !== null) {
          proxy.setAuth(token)
        } else {
          proxy.clearAuth()
        }
        return proxy
      }
      signInApi = {
        mutation: (fn, args) => withAuth().mutation(fn, args),
        action: (fn, args) => withAuth().action(fn, args),
      }
      authClient = new AuthClient({
        mode: 'ssr',
        authApi: {
          refreshSession: async () => (await postAuth(route(routes.refresh))).tokens,
          signOut: async () => {
            await postAuth(route(routes.signOut))
          },
        },
        storage,
        storageNamespace,
        // The server refreshed on our behalf, so this is the freshest token.
        initialAccessToken: tokenState.value,
        verbose: auth?.verbose,
        ambientSignIns: {
          signIns,
          signInApi: signInApi as never,
          convex: convexMutationApi as never,
          replaceUrl,
        },
      })
    } else {
      // Refresh / sign-out use a separate HTTP client: the WebSocket client
      // is paused while it waits for the token a refresh would produce.
      const http = new ConvexHttpClient(ctx.url)
      const refreshSession = makeFunctionReference<'mutation'>(apiNames.refreshSession)
      const signOutRef = makeFunctionReference<'mutation'>(apiNames.signOut)
      signInApi = {
        mutation: (fn, args) => convex.mutation(fn, args),
        action: (fn, args) => convex.action(fn, args),
      }
      authClient = new AuthClient({
        mode: 'spa',
        authApi: {
          refreshSession: (refreshToken) => http.mutation(refreshSession, { refreshToken }),
          signOut: async (refreshToken) => {
            await http.mutation(signOutRef, { refreshToken })
          },
        },
        storage,
        storageNamespace,
        verbose: auth?.verbose,
        ambientSignIns: {
          signIns,
          signInApi: signInApi as never,
          convex: convexMutationApi as never,
          replaceUrl,
        },
      })
    }

    const state = shallowRef(authClient.getSnapshot())
    authClient.subscribe(() => {
      state.value = authClient.getSnapshot()
    })

    // Mirror the live token into the shared token state (HttpClient
    // snapshots, `hasSsrSession`) — after hydration, so the first client
    // render matches the server.
    const syncTokenState = () => {
      if (!state.value.isLoading) {
        tokenState.value = state.value.token
      }
    }
    if (nuxtApp.isHydrating) {
      nuxtApp.hooks.hookOnce('app:suspense:resolve', () => {
        syncTokenState()
        watch(state, syncTokenState)
      })
    } else {
      watch(state, syncTokenState, { immediate: true })
    }

    const ambientCache = new Map<string, Readonly<Ref<unknown>>>()
    const ambientValue = <T>(id: string, key: string): Readonly<Ref<T | undefined>> => {
      const cacheKey = `${id}:${key}`
      let cached = ambientCache.get(cacheKey)
      if (!cached) {
        const reader = authClient.ambientSignInValues(id)
        const value = shallowRef(reader.get<unknown>(key))
        reader.subscribe(key, () => {
          value.value = reader.get<unknown>(key)
        })
        cached = readonly(value)
        ambientCache.set(cacheKey, cached)
      }
      return cached as Readonly<Ref<T | undefined>>
    }

    const binding: ConvexAuthBinding = {
      mode,
      state,
      signInApi,
      setSession: (session) => authClient.setSession(session as never),
      signOut: () => authClient.signOut(),
      ambientValue,
    }
    ctx.convexAuth = binding

    const convexAuth = useConvexAuth({
      fetchToken: (args) => authClient.fetchAccessToken(args),
      isLoading: () => state.value.isLoading,
      isAuthenticated: () => state.value.isAuthenticated,
    })

    // Session watcher: once Convex confirms auth, subscribe to the app's
    // `isAuthenticated` query; `false` means the session was revoked
    // server-side, so sign out (which also clears SSR cookies).
    const isAuthenticatedRef = makeFunctionReference<'query', Record<string, never>, boolean>(
      apiNames.isAuthenticated,
    )
    let stopWatching: (() => void) | null = null
    watch(
      () => convexAuth.isAuthenticated.value,
      (authenticated) => {
        stopWatching?.()
        stopWatching = null
        if (!authenticated) {
          return
        }
        const unsubscribe = convex.onUpdate(
          isAuthenticatedRef,
          {},
          (hasLiveSession) => {
            if (hasLiveSession === false) {
              void authClient.signOut()
            }
          },
          () => {
            // A missing or failing `isAuthenticated` export shouldn't sign
            // users out; revocation then waits for the next refresh.
          },
        )
        stopWatching = () => unsubscribe()
      },
      { immediate: true },
    )

    void authClient.init()
  },
})
