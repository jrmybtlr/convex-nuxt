import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import { convexToJson, jsonToConvex } from 'convex/values'
import { useAsyncData } from 'nuxt/app'
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
   */
  key?: string

  /**
   * Execute the query during SSR and transfer its result through the Nuxt payload.
   * @default true
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
}

export interface UseConvexQueryReturn<T> {
  data: Ref<T | null | undefined> | ComputedRef<T | null | undefined>
  error: Ref<Error | null | undefined> | ComputedRef<Error | null | undefined>
  pending: Ref<boolean> | ComputedRef<boolean>
  status: Ref<string> | ComputedRef<string>
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
  const server = options.server ?? true
  const live = options.live ?? true
  const ctx = useConvexContext()

  const resolveArgs = (): ConvexQueryArgs<Query> =>
    toValue(args) as ConvexQueryArgs<Query>

  const key = convexQueryKey(query, resolveArgs(), options.key)

  const asyncData = await useAsyncData<FunctionReturnType<Query> | null>(
    key,
    async () => {
      const argsValue = resolveArgs()
      if (argsValue === 'skip') {
        return null
      }

      const token = options.token ?? ctx.ssrToken
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
      watch: [() => toValue(args)],
    },
  )

  const refresh = async () => {
    await asyncData.refresh()
  }

  if (import.meta.server || !live) {
    return {
      data: asyncData.data as Ref<FunctionReturnType<Query> | null | undefined>,
      error: asyncData.error,
      pending: computed(() => {
        if (resolveArgs() === 'skip') {
          return false
        }
        return asyncData.pending.value
      }),
      status: computed(() => {
        if (resolveArgs() === 'skip') {
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

  watch(() => resolveArgs(), subscribe, { immediate: true })
  onScopeDispose(() => {
    cancel?.()
  })

  const overlay = computed(() =>
    resolveQueryOverlay<FunctionReturnType<Query>>({
      skipped: resolveArgs() === 'skip',
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
