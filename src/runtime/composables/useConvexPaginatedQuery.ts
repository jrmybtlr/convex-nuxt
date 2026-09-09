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
import { useConvexContext } from '../utils/context'
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
}

export type UseConvexPaginatedQueryReturn<Query extends PaginatedQueryReference> = {
  results: ComputedRef<Array<PaginatedQueryItem<Query>>>
  status: ComputedRef<PaginationStatus>
  isLoading: ComputedRef<boolean>
  loadMore: (numItems?: number) => void
  error: Ref<Error | null>
}

/**
 * Paginated Convex query with SSR for the first page and client `loadMore`.
 *
 * Later pages are fetched one-shot on the browser (not SSR). The first page
 * keeps a live `onUpdate` subscription so inserts/edits appear automatically.
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
  const ctx = useConvexContext()

  const resolveArgs = (): PaginatedQueryArgs<Query> | 'skip' =>
    toValue(args) as PaginatedQueryArgs<Query> | 'skip'

  const firstPageArgs = (): FunctionArgs<Query> | 'skip' => {
    const base = resolveArgs()
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

  const key = computed(() =>
    convexQueryKey(query, firstPageArgs(), options.key),
  )

  const asyncData = await useAsyncData<PaginationResult<PaginatedQueryItem<Query>> | null>(
    key,
    async () => {
      const pageArgs = firstPageArgs()
      if (pageArgs === 'skip') {
        return null
      }
      const token = options.token ?? ctx.ssrToken.value
      const http = ctx.createHttpClient({ token })
      // PaginatedQueryReference generics confuse OptionalRestArgs; assert once.
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
      ],
    },
  )

  type Item = PaginatedQueryItem<Query>
  const extraPages = shallowRef<Array<PaginationResult<Item>>>([])
  const loadingMore = ref(false)
  const liveFirst = shallowRef<PaginationResult<Item> | null>(null)
  const liveReady = ref(false)
  const error = ref<Error | null>(null)

  const firstPage = computed((): PaginationResult<Item> | null => {
    if (liveReady.value && liveFirst.value) {
      return liveFirst.value
    }
    return asyncData.data.value ?? null
  })

  const results = computed((): Item[] => {
    const first = firstPage.value
    if (!first) {
      return []
    }
    const pages = [first, ...extraPages.value]
    return pages.flatMap(p => p.page)
  })

  const continueCursor = computed(() => {
    const pages = firstPage.value
      ? [firstPage.value, ...extraPages.value]
      : []
    if (pages.length === 0) {
      return null
    }
    return pages[pages.length - 1]!.continueCursor
  })

  const isDone = computed(() => {
    const pages = firstPage.value
      ? [firstPage.value, ...extraPages.value]
      : []
    if (pages.length === 0) {
      return false
    }
    return pages[pages.length - 1]!.isDone
  })

  const status = computed((): PaginationStatus => {
    if (resolveArgs() === 'skip') {
      return 'Exhausted'
    }
    if (!firstPage.value && (asyncData.pending.value || !liveReady.value)) {
      return 'LoadingFirstPage'
    }
    if (loadingMore.value) {
      return 'LoadingMore'
    }
    if (isDone.value) {
      return 'Exhausted'
    }
    return 'CanLoadMore'
  })

  const isLoading = computed(
    () => status.value === 'LoadingFirstPage' || status.value === 'LoadingMore',
  )

  // Reset extra pages when the query identity changes.
  watch(
    () => convexQueryKey(query, resolveArgs() === 'skip' ? {} : resolveArgs()),
    () => {
      extraPages.value = []
      liveReady.value = false
      liveFirst.value = null
      error.value = null
    },
  )

  if (import.meta.client && ctx.client) {
    const client = ctx.client
    let cancel: (() => void) | undefined

    const subscribe = () => {
      cancel?.()
      cancel = undefined
      liveReady.value = false
      liveFirst.value = null

      const pageArgs = firstPageArgs()
      if (pageArgs === 'skip') {
        return
      }

      cancel = client.onUpdate(
        query,
        pageArgs,
        (result) => {
          liveFirst.value = result as PaginationResult<Item>
          liveReady.value = true
          error.value = null
          // First-page live update invalidates loaded tail pages.
          extraPages.value = []
        },
        (err) => {
          error.value = err
          liveReady.value = true
        },
      )
    }

    watch(() => [toValue(args), options.initialNumItems], subscribe, {
      immediate: true,
    })
    onScopeDispose(() => {
      cancel?.()
    })
  }

  const loadMore = (numItems = options.initialNumItems) => {
    if (import.meta.server || !ctx.client) {
      return
    }
    if (status.value !== 'CanLoadMore' || loadingMore.value) {
      return
    }
    const cursor = continueCursor.value
    if (cursor === null && firstPage.value && !firstPage.value.isDone) {
      // continueCursor null + not done is valid for first page end state
    }
    if (isDone.value) {
      return
    }

    const base = resolveArgs()
    if (base === 'skip') {
      return
    }

    loadingMore.value = true
    error.value = null
    const pageArgs = {
      ...(base as object),
      paginationOpts: {
        numItems,
        cursor: continueCursor.value,
      },
    } as FunctionArgs<Query>

    void ctx.client
      .query(query, pageArgs)
      .then((result) => {
        const page = result as PaginationResult<Item>
        extraPages.value = [...extraPages.value, page]
      })
      .catch((cause: unknown) => {
        error.value = cause instanceof Error ? cause : new Error(String(cause))
      })
      .finally(() => {
        loadingMore.value = false
      })
  }

  return {
    results,
    status,
    isLoading,
    loadMore,
    error,
  }
}
