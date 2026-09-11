import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
} from 'convex/server'
import { convexToJson, jsonToConvex } from 'convex/values'
import { useAsyncData, useRuntimeConfig } from 'nuxt/app'
import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import { resolveAuthGatedArgs } from '../utils/authGate'
import { useConvexContext } from '../utils/context'
import { readHydratedPayloadCache } from '../utils/payloadCache'
import { convexQueryKey } from '../utils/queryKey'

/**
 * A query usable with {@link useConvexPaginatedQuery}.
 * Must accept `paginationOpts` and return {@link PaginationResult}.
 */
export type PaginatedQueryReference = FunctionReference<
  'query',
  'public',
  { paginationOpts: PaginationOptions },
  PaginationResult<any>
>

export type PaginatedQueryArgs<Query extends PaginatedQueryReference> = Omit<
  FunctionArgs<Query>,
  'paginationOpts'
>

export type PaginatedQueryItem<Query extends PaginatedQueryReference> =
  FunctionReturnType<Query>['page'][number]

export type PaginationStatus =
  | 'LoadingFirstPage'
  | 'CanLoadMore'
  | 'LoadingMore'
  | 'Exhausted'

export interface UseConvexPaginatedQueryOptions {
  /** Items to load on the first page (and default for `loadMore`). */
  initialNumItems: number
  /** Explicit Nuxt payload key for the first page. */
  key?: string
  /** SSR the first page via HttpClient. Defaults to `convex.server`. */
  server?: boolean
  /** JWT for the SSR / HttpClient first page. */
  token?: string
  /**
   * Skip first-page HttpClient and live paginated subscribe until Convex
   * confirms auth. Same contract as `useConvexQuery({ authenticated: true })`.
   * @default false
   */
  authenticated?: boolean
}

export type UseConvexPaginatedQueryReturn<Query extends PaginatedQueryReference> = {
  results: ComputedRef<Array<PaginatedQueryItem<Query>>>
  status: ComputedRef<PaginationStatus>
  isLoading: ComputedRef<boolean>
  loadMore: (numItems?: number) => void
  error: Ref<Error | null>
}

/** Runtime shape from `ConvexClient.onPaginatedUpdate_experimental`. */
type LivePaginatedResult<Item> = {
  results: Item[]
  status: PaginationStatus
  loadMore: (numItems: number) => boolean
}

/**
 * Paginated Convex query with SSR for the first page and live multi-page updates.
 *
 * On the browser this uses `ConvexClient.onPaginatedUpdate_experimental` so
 * every loaded page stays reactive (React `usePaginatedQuery` parity). The SSR
 * snapshot hydrates the first page until the live subscription is ready.
 */
export async function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
>(
  query: Query,
  args: MaybeRefOrGetter<PaginatedQueryArgs<Query> | 'skip'> = {} as PaginatedQueryArgs<Query>,
  options: UseConvexPaginatedQueryOptions,
): Promise<UseConvexPaginatedQueryReturn<Query>> {
  if (options.initialNumItems <= 0) {
    throw new Error(
      '[convex-nuxt] useConvexPaginatedQuery initialNumItems must be > 0',
    )
  }

  const runtimeConfig = useRuntimeConfig()
  const defaultServer = (
    runtimeConfig.public.convex as { server?: boolean } | undefined
  )?.server
  const server = options.server ?? defaultServer ?? true
  const requireAuth = options.authenticated ?? false
  const ctx = useConvexContext()

  const resolveRawArgs = (): PaginatedQueryArgs<Query> | 'skip' =>
    toValue(args) as PaginatedQueryArgs<Query> | 'skip'

  const resolveEffectiveArgs = (): PaginatedQueryArgs<Query> | 'skip' =>
    resolveAuthGatedArgs(resolveRawArgs(), {
      authenticated: requireAuth,
      isAuthenticated: ctx.auth.isAuthenticated.value,
    })

  const firstPageArgsFrom = (
    base: PaginatedQueryArgs<Query> | 'skip',
  ): FunctionArgs<Query> | 'skip' => {
    if (base === 'skip') {
      return 'skip'
    }
    return {
      ...(base as object),
      paginationOpts: {
        numItems: options.initialNumItems,
        cursor: null,
      },
    } as FunctionArgs<Query>
  }

  // Key from raw args so auth-skip keeps the SSR first-page payload slot.
  const key = computed(() =>
    convexQueryKey(query, firstPageArgsFrom(resolveRawArgs()), options.key),
  )

  const asyncData = await useAsyncData<PaginationResult<PaginatedQueryItem<Query>> | null>(
    key,
    async () => {
      const pageArgs = firstPageArgsFrom(resolveEffectiveArgs())
      if (pageArgs === 'skip') {
        return null
      }
      const token = options.token ?? ctx.ssrToken.value
      if (requireAuth && import.meta.client && !token) {
        return readHydratedPayloadCache<PaginationResult<
          PaginatedQueryItem<Query>
        > | null>(key)
      }
      const http = ctx.createHttpClient({ token })
      const result = await http.query(
        query as never,
        pageArgs as never,
      )
      return jsonToConvex(convexToJson(result as never)) as unknown as PaginationResult<
        PaginatedQueryItem<Query>
      >
    },
    {
      server,
      watch: [
        () => toValue(args),
        () => options.token ?? ctx.ssrToken.value,
        () =>
          requireAuth
          && ctx.auth.isAuthenticated.value
          && !!(options.token ?? ctx.ssrToken.value),
      ],
    },
  )

  type Item = PaginatedQueryItem<Query>
  const live = shallowRef<LivePaginatedResult<Item> | null>(null)
  const liveReady = ref(false)
  const error = ref<Error | null>(null)
  /** Latest `loadMore` from the experimental paginated subscription. */
  const liveLoadMore = shallowRef<((numItems: number) => boolean) | null>(null)

  const results = computed((): Item[] => {
    if (resolveEffectiveArgs() === 'skip') {
      return asyncData.data.value?.page ?? []
    }
    if (liveReady.value && live.value) {
      return live.value.results
    }
    return asyncData.data.value?.page ?? []
  })

  const status = computed((): PaginationStatus => {
    if (resolveEffectiveArgs() === 'skip') {
      // Keep SSR page status while auth-gated (not Exhausted empty).
      if (asyncData.data.value) {
        return asyncData.data.value.isDone ? 'Exhausted' : 'CanLoadMore'
      }
      return 'Exhausted'
    }
    if (liveReady.value && live.value) {
      return live.value.status
    }
    if (asyncData.pending.value || (import.meta.client && !liveReady.value)) {
      // Prefer SSR page while the live subscription catches up.
      if (asyncData.data.value) {
        return asyncData.data.value.isDone ? 'Exhausted' : 'CanLoadMore'
      }
      return 'LoadingFirstPage'
    }
    if (asyncData.data.value) {
      return asyncData.data.value.isDone ? 'Exhausted' : 'CanLoadMore'
    }
    return 'LoadingFirstPage'
  })

  const isLoading = computed(
    () => status.value === 'LoadingFirstPage' || status.value === 'LoadingMore',
  )

  if (import.meta.client && ctx.client) {
    const client = ctx.client
    let cancel: (() => void) | undefined

    const subscribe = () => {
      cancel?.()
      cancel = undefined
      liveReady.value = false
      live.value = null
      liveLoadMore.value = null
      error.value = null

      const base = resolveEffectiveArgs()
      if (base === 'skip') {
        liveReady.value = true
        return
      }

      // Experimental paginated subscription keeps every loaded page live.
      // Callback is typed as PaginationResult in convex but runtime value is
      // PaginatedQueryResult `{ results, status, loadMore }`.
      cancel = client.onPaginatedUpdate_experimental(
        query as never,
        base as never,
        { initialNumItems: options.initialNumItems },
        (result) => {
          const page = result as unknown as LivePaginatedResult<Item>
          live.value = page
          liveLoadMore.value = page.loadMore
          liveReady.value = true
          error.value = null
        },
        (err) => {
          error.value = err
          liveReady.value = true
        },
      )
    }

    watch(
      () =>
        [
          toValue(args),
          options.initialNumItems,
          ctx.auth.isAuthenticated.value,
        ] as const,
      subscribe,
      { immediate: true },
    )
    onScopeDispose(() => {
      cancel?.()
    })
  }

  const loadMore = (numItems = options.initialNumItems) => {
    if (import.meta.server || !ctx.client) {
      return
    }
    if (status.value !== 'CanLoadMore') {
      return
    }
    const fn = liveLoadMore.value
    if (!fn) {
      return
    }
    fn(numItems)
  }

  return {
    results,
    status,
    isLoading,
    loadMore,
    error,
  }
}
