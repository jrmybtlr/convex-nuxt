import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import { convexToJson, jsonToConvex } from 'convex/values'
import { useAsyncData, useNuxtApp, useRuntimeConfig } from 'nuxt/app'
import {
  computed,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import { resolveAuthGatedArgs } from '../utils/authGate'
import { useConvexContext } from '../utils/context'
import { resolveQueryOverlay } from '../utils/overlay'
import { convexQueryKey } from '../utils/queryKey'

export type ConvexQueryArgs<Query extends FunctionReference<'query'>> =
  | FunctionArgs<Query>
  | 'skip'

export interface UseConvexQueryOptions {
  /**
   * Explicit Nuxt payload/cache key.
   * Defaults to `convex:<functionName>:<argsJSON>`.
   * `'skip'` does not change the key (same slot as empty args).
   */
  key?: string

  /**
   * Run the HttpClient snapshot during SSR and transfer it through the Nuxt payload.
   * Defaults to `convex.server` from module config (`true`).
   */
  server?: boolean

  /**
   * Make the initial Nuxt request non-blocking during client navigation.
   * @default false
   */
  lazy?: boolean

  /**
   * Subscribe with ConvexClient on the browser after hydration.
   * @default true
   */
  live?: boolean

  /**
   * JWT for this request's HttpClient (SSR / one-shot refresh).
   * Never put this in public runtime config.
   */
  token?: string

  /**
   * Skip HttpClient fetch and live subscribe until Convex confirms auth
   * (`isAuthenticated`). SSR still runs when the server plugin stamps auth
   * from the JWT cookie; the client keeps the SSR payload via the overlay
   * until `setAuth` confirms. Prefer this over manually wrapping args in
   * `computed(() => isAuthenticated.value ? args : 'skip')`.
   *
   * @default false
   */
  authenticated?: boolean
}

export interface UseConvexQueryReturn<T> {
  data: Ref<T | null | undefined> | ComputedRef<T | null | undefined>
  error: Ref<Error | null | undefined> | ComputedRef<Error | null | undefined>
  pending: Ref<boolean> | ComputedRef<boolean>
  status: Ref<'pending' | 'success' | 'error' | string> | ComputedRef<'pending' | 'success' | 'error' | string>
  refresh: () => Promise<void>
}

/**
 * Nuxt-native Convex query.
 *
 * Server + client both call `useAsyncData` so the Nuxt payload hydrates without
 * a duplicate HTTP request. On the browser, a live `ConvexClient` subscription
 * overlays the payload (`live ?? payload`), matching Next.js `usePreloadedQuery`.
 */
export async function useConvexQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: MaybeRefOrGetter<ConvexQueryArgs<Query>> = {} as ConvexQueryArgs<Query>,
  options: UseConvexQueryOptions = {},
): Promise<UseConvexQueryReturn<FunctionReturnType<Query>>> {
  const runtimeConfig = useRuntimeConfig()
  const defaultServer = (
    runtimeConfig.public.convex as { server?: boolean } | undefined
  )?.server
  const server = options.server ?? defaultServer ?? true
  const live = options.live ?? true
  const requireAuth = options.authenticated ?? false
  const ctx = useConvexContext()

  /** Caller-provided args (may be `'skip'` for non-auth gates). */
  const resolveRawArgs = (): ConvexQueryArgs<Query> =>
    toValue(args) as ConvexQueryArgs<Query>

  /** Effective args for fetch / subscribe (keys still come from raw args). */
  const resolveEffectiveArgs = (): ConvexQueryArgs<Query> =>
    resolveAuthGatedArgs(resolveRawArgs(), {
      authenticated: requireAuth,
      isAuthenticated: ctx.auth.isAuthenticated.value,
    })

  // Reactive key from raw args so auth-skip keeps the same payload slot.
  // Caller `'skip'` still shares the empty-args key (SSR reuse).
  const key = computed(() =>
    convexQueryKey(query, resolveRawArgs(), options.key),
  )

  const asyncData = await useAsyncData<FunctionReturnType<Query> | null>(
    key,
    async () => {
      const argsValue = resolveEffectiveArgs()
      if (argsValue === 'skip') {
        return null
      }

      const token = options.token ?? ctx.ssrToken.value
      // HttpOnly clients cannot send a JWT on HttpClient — keep the hydrated
      // payload and let the live subscription own updates.
      if (requireAuth && import.meta.client && !token) {
        const nuxtApp = useNuxtApp()
        const cached = nuxtApp.payload.data[toValue(key)]
        return (cached ?? null) as FunctionReturnType<Query> | null
      }

      const http = ctx.createHttpClient({ token })
      const result = await http.query(
        query,
        (argsValue ?? {}) as FunctionArgs<Query>,
      )
      // Round-trip Convex values so Int64/bytes survive the Nuxt payload.
      return jsonToConvex(convexToJson(result)) as FunctionReturnType<Query>
    },
    {
      server,
      lazy: options.lazy ?? false,
      watch: [
        () => toValue(args),
        // Re-run HttpClient snapshot when the SSR JWT cookie / token changes
        // (e.g. after sign-in with live:false, or Refresh).
        () => options.token ?? ctx.ssrToken.value,
        // Re-run when auth confirms *and* a JWT is available for HttpClient
        // (readable cookie / SSR). Avoids anonymous client refetches with HttpOnly.
        () =>
          requireAuth
          && ctx.auth.isAuthenticated.value
          && !!(options.token ?? ctx.ssrToken.value),
      ],
    },
  )

  const refresh = async () => {
    // HttpOnly clients have no JWT for HttpClient — keep the payload / live.
    if (
      requireAuth
      && import.meta.client
      && !(options.token ?? ctx.ssrToken.value)
    ) {
      return
    }
    await asyncData.refresh()
  }

  if (import.meta.server || !live) {
    return {
      data: asyncData.data as Ref<FunctionReturnType<Query> | null | undefined>,
      error: asyncData.error,
      pending: computed(() => {
        if (resolveEffectiveArgs() === 'skip') {
          return false
        }
        return asyncData.pending.value
      }),
      status: computed(() => {
        if (resolveEffectiveArgs() === 'skip') {
          return 'success'
        }
        return asyncData.status.value
      }),
      refresh,
    }
  }

  const client = ctx.client
  if (!client) {
    throw new Error('[convex-nuxt] ConvexClient is not available on the client.')
  }

  const liveReady = ref(false)
  const liveData = ref<FunctionReturnType<Query> | undefined>()
  const liveError = ref<Error | null>(null)

  let cancel: (() => void) | undefined

  const subscribe = (argsValue: ConvexQueryArgs<Query>) => {
    cancel?.()
    cancel = undefined
    liveReady.value = false
    liveError.value = null

    if (argsValue === 'skip') {
      liveData.value = undefined
      return
    }

    cancel = client.onUpdate(
      query,
      (argsValue ?? {}) as FunctionArgs<Query>,
      (result) => {
        liveData.value = result
        liveError.value = null
        liveReady.value = true
      },
      (err) => {
        liveError.value = err
        liveReady.value = true
      },
    )
  }

  watch(
    () => [resolveEffectiveArgs(), ctx.auth.isAuthenticated.value] as const,
    ([argsValue]) => {
      subscribe(argsValue)
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    cancel?.()
  })

  const overlay = computed(() =>
    resolveQueryOverlay<FunctionReturnType<Query>>({
      skipped: resolveEffectiveArgs() === 'skip',
      liveReady: liveReady.value,
      liveData: liveData.value,
      liveError: liveError.value,
      payload: asyncData.data.value,
      payloadError: asyncData.error.value ?? null,
      payloadPending: asyncData.pending.value,
    }),
  )

  return {
    data: computed(() => overlay.value.data),
    error: computed(() => overlay.value.error),
    pending: computed(() => overlay.value.pending),
    status: computed(() => overlay.value.status),
    refresh,
  }
}
