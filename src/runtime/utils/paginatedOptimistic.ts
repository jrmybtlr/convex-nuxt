import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import type { OptimisticLocalStore } from 'convex/browser'
import type { Value } from 'convex/values'
import { compareValues, convexToJson } from 'convex/values'
import type {
  PaginatedQueryArgs,
  PaginatedQueryItem,
  PaginatedQueryReference,
} from '../composables/useConvexPaginatedQuery'

/**
 * Apply an optimistic update to every loaded page of a paginated query
 * (React `optimisticallyUpdateValueInPaginatedQuery` parity).
 */
export function optimisticallyUpdateValueInPaginatedQuery<
  Query extends PaginatedQueryReference,
>(
  localStore: OptimisticLocalStore,
  query: Query,
  args: PaginatedQueryArgs<Query>,
  updateValue: (
    currentValue: PaginatedQueryItem<Query>,
  ) => PaginatedQueryItem<Query>,
): void {
  const expectedArgs = JSON.stringify(convexToJson(args as Value))

  for (const queryResult of localStore.getAllQueries(query)) {
    if (queryResult.value === undefined) {
      continue
    }
    const { paginationOpts: _, ...innerArgs } = queryResult.args as {
      paginationOpts: unknown
    } & Record<string, Value>
    if (JSON.stringify(convexToJson(innerArgs as Value)) !== expectedArgs) {
      continue
    }
    const value = queryResult.value
    if (
      typeof value === 'object'
      && value !== null
      && Array.isArray((value as { page?: unknown }).page)
    ) {
      localStore.setQuery(query, queryResult.args, {
        ...value,
        page: (value as { page: PaginatedQueryItem<Query>[] }).page.map(
          updateValue,
        ),
      })
    }
  }
}

/**
 * Insert an item at the top of a paginated list's first loaded page.
 */
export function insertAtTop<Query extends PaginatedQueryReference>(options: {
  paginatedQuery: Query
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  localQueryStore: OptimisticLocalStore
  item: PaginatedQueryItem<Query>
}): void {
  const { paginatedQuery, argsToMatch, localQueryStore, item } = options
  const queries = localQueryStore.getAllQueries(paginatedQuery)
  const matching = queries.filter((q) => {
    if (argsToMatch === undefined) {
      return true
    }
    return Object.keys(argsToMatch).every(
      // @ts-expect-error both are plain objects
      key => compareValues(argsToMatch[key], q.args[key]) === 0,
    )
  })
  const firstPage = matching.find(
    q => (q.args as { paginationOpts: { cursor: unknown } }).paginationOpts.cursor === null,
  )
  if (firstPage === undefined || firstPage.value === undefined) {
    return
  }
  localQueryStore.setQuery(paginatedQuery, firstPage.args, {
    ...firstPage.value,
    page: [item, ...firstPage.value.page],
  })
}

/**
 * Insert an item at the bottom of a paginated list only if the last page is loaded.
 */
export function insertAtBottomIfLoaded<
  Query extends PaginatedQueryReference,
>(options: {
  paginatedQuery: Query
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  localQueryStore: OptimisticLocalStore
  item: PaginatedQueryItem<Query>
}): void {
  const { paginatedQuery, localQueryStore, item, argsToMatch } = options
  const queries = localQueryStore.getAllQueries(paginatedQuery)
  const matching = queries.filter((q) => {
    if (argsToMatch === undefined) {
      return true
    }
    return Object.keys(argsToMatch).every(
      // @ts-expect-error both are plain objects
      key => compareValues(argsToMatch[key], q.args[key]) === 0,
    )
  })
  const lastPage = matching.find(
    q => q.value !== undefined && q.value.isDone,
  )
  if (lastPage === undefined || lastPage.value === undefined) {
    return
  }
  localQueryStore.setQuery(paginatedQuery, lastPage.args, {
    ...lastPage.value,
    page: [...lastPage.value.page, item],
  })
}

type LocalQueryResult<Query extends FunctionReference<'query'>> = {
  args: FunctionArgs<Query>
  value: undefined | FunctionReturnType<Query>
}

type LoadedResult<Query extends FunctionReference<'query'>> = {
  args: FunctionArgs<Query>
  value: FunctionReturnType<Query>
}

/**
 * Insert an item at a sort-key position within loaded paginated pages.
 */
export function insertAtPosition<
  Query extends PaginatedQueryReference,
>(options: {
  paginatedQuery: Query
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  sortOrder: 'asc' | 'desc'
  sortKeyFromItem: (element: PaginatedQueryItem<Query>) => Value | Value[]
  localQueryStore: OptimisticLocalStore
  item: PaginatedQueryItem<Query>
}): void {
  const {
    paginatedQuery,
    sortOrder,
    sortKeyFromItem,
    localQueryStore,
    item,
    argsToMatch,
  } = options

  const queries: LocalQueryResult<Query>[] =
    localQueryStore.getAllQueries(paginatedQuery)

  const queryGroups: Record<string, LocalQueryResult<Query>[]> = {}
  for (const query of queries) {
    if (
      argsToMatch !== undefined
      && !Object.keys(argsToMatch).every(
        // @ts-expect-error both are plain objects
        key => argsToMatch[key] === query.args[key],
      )
    ) {
      continue
    }
    const key = JSON.stringify(
      Object.fromEntries(
        Object.entries(query.args).map(([k, v]) => [
          k,
          k === 'paginationOpts' ? (v as { id?: unknown }).id : v,
        ]),
      ),
    )
    queryGroups[key] ??= []
    queryGroups[key].push(query)
  }

  for (const pageQueries of Object.values(queryGroups)) {
    insertAtPositionInPages({
      pageQueries,
      paginatedQuery,
      sortOrder,
      sortKeyFromItem,
      localQueryStore,
      item,
    })
  }
}

function insertAtPositionInPages<
  Query extends PaginatedQueryReference,
>(options: {
  pageQueries: LocalQueryResult<Query>[]
  paginatedQuery: Query
  sortOrder: 'asc' | 'desc'
  sortKeyFromItem: (element: PaginatedQueryItem<Query>) => Value | Value[]
  localQueryStore: OptimisticLocalStore
  item: PaginatedQueryItem<Query>
}): void {
  const {
    pageQueries,
    sortOrder,
    sortKeyFromItem,
    localQueryStore,
    item,
    paginatedQuery,
  } = options

  const insertedKey = sortKeyFromItem(item)
  const loadedPages: LoadedResult<Query>[] = pageQueries.filter(
    (q): q is LoadedResult<Query> =>
      q.value !== undefined && q.value.page.length > 0,
  )
  const sortedPages = loadedPages.sort((a, b) => {
    const aKey = sortKeyFromItem(a.value.page[0]!)
    const bKey = sortKeyFromItem(b.value.page[0]!)
    return sortOrder === 'asc'
      ? compareValues(aKey, bKey)
      : compareValues(bKey, aKey)
  })

  const firstLoadedPage = sortedPages[0]
  if (firstLoadedPage === undefined) {
    return
  }
  const firstPageKey = sortKeyFromItem(firstLoadedPage.value.page[0]!)
  const isBeforeFirstPage =
    sortOrder === 'asc'
      ? compareValues(insertedKey, firstPageKey) <= 0
      : compareValues(insertedKey, firstPageKey) >= 0
  if (isBeforeFirstPage) {
    if (firstLoadedPage.args.paginationOpts.cursor === null) {
      localQueryStore.setQuery(paginatedQuery, firstLoadedPage.args, {
        ...firstLoadedPage.value,
        page: [item, ...firstLoadedPage.value.page],
      })
    }
    return
  }

  const lastLoadedPage = sortedPages[sortedPages.length - 1]
  if (lastLoadedPage === undefined) {
    return
  }
  const lastPageKey = sortKeyFromItem(
    lastLoadedPage.value.page[lastLoadedPage.value.page.length - 1]!,
  )
  const isAfterLastPage =
    sortOrder === 'asc'
      ? compareValues(insertedKey, lastPageKey) >= 0
      : compareValues(insertedKey, lastPageKey) <= 0
  if (isAfterLastPage) {
    if (lastLoadedPage.value.isDone) {
      localQueryStore.setQuery(paginatedQuery, lastLoadedPage.args, {
        ...lastLoadedPage.value,
        page: [...lastLoadedPage.value.page, item],
      })
    }
    return
  }

  const successorPageIndex = sortedPages.findIndex(p =>
    sortOrder === 'asc'
      ? compareValues(sortKeyFromItem(p.value.page[0]!), insertedKey) > 0
      : compareValues(sortKeyFromItem(p.value.page[0]!), insertedKey) < 0,
  )
  const pageToUpdate =
    successorPageIndex === -1
      ? sortedPages[sortedPages.length - 1]
      : sortedPages[successorPageIndex - 1]
  if (pageToUpdate === undefined) {
    return
  }
  const indexWithinPage = pageToUpdate.value.page.findIndex(element =>
    sortOrder === 'asc'
      ? compareValues(sortKeyFromItem(element), insertedKey) >= 0
      : compareValues(sortKeyFromItem(element), insertedKey) <= 0,
  )
  const newPage =
    indexWithinPage === -1
      ? [...pageToUpdate.value.page, item]
      : [
          ...pageToUpdate.value.page.slice(0, indexWithinPage),
          item,
          ...pageToUpdate.value.page.slice(indexWithinPage),
        ]
  localQueryStore.setQuery(paginatedQuery, pageToUpdate.args, {
    ...pageToUpdate.value,
    page: newPage,
  })
}
