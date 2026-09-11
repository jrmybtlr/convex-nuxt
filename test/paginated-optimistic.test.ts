import { describe, expect, it, vi } from 'vite-plus/test'
import { makeFunctionReference } from 'convex/server'
import type { OptimisticLocalStore } from 'convex/browser'
import {
  insertAtTop,
  insertAtBottomIfLoaded,
  optimisticallyUpdateValueInPaginatedQuery,
} from '../src/runtime/utils/paginatedOptimistic'

const listPaginated = makeFunctionReference<
  'query',
  { paginationOpts: { numItems: number; cursor: string | null }; listId?: string },
  { page: Array<{ _id: string; text: string }>; isDone: boolean; continueCursor: string }
>('tasks:listPaginated')

function makeStore(
  pages: Array<{
    args: Record<string, unknown>
    value:
      | { page: Array<{ _id: string; text: string }>; isDone: boolean; continueCursor: string }
      | undefined
  }>,
): OptimisticLocalStore {
  const setQuery = vi.fn()
  return {
    getQuery: vi.fn(),
    getAllQueries: vi.fn(() => pages),
    setQuery,
  } as unknown as OptimisticLocalStore
}

describe('paginated optimistic helpers', () => {
  it('insertAtTop prepends to the first page (cursor null)', () => {
    const store = makeStore([
      {
        args: { paginationOpts: { numItems: 5, cursor: null } },
        value: {
          page: [{ _id: '1', text: 'a' }],
          isDone: false,
          continueCursor: 'c1',
        },
      },
    ])
    insertAtTop({
      paginatedQuery: listPaginated,
      localQueryStore: store,
      item: { _id: '0', text: 'new' },
    })
    expect(store.setQuery).toHaveBeenCalledWith(
      listPaginated,
      { paginationOpts: { numItems: 5, cursor: null } },
      expect.objectContaining({
        page: [
          { _id: '0', text: 'new' },
          { _id: '1', text: 'a' },
        ],
      }),
    )
  })

  it('insertAtBottomIfLoaded only updates a done page', () => {
    const store = makeStore([
      {
        args: { paginationOpts: { numItems: 5, cursor: 'c1' } },
        value: {
          page: [{ _id: '2', text: 'b' }],
          isDone: true,
          continueCursor: '',
        },
      },
    ])
    insertAtBottomIfLoaded({
      paginatedQuery: listPaginated,
      localQueryStore: store,
      item: { _id: '3', text: 'c' },
    })
    expect(store.setQuery).toHaveBeenCalled()
  })

  it('optimisticallyUpdateValueInPaginatedQuery maps matching pages', () => {
    const store = makeStore([
      {
        args: {
          listId: 'L1',
          paginationOpts: { numItems: 5, cursor: null },
        },
        value: {
          page: [{ _id: '1', text: 'a' }],
          isDone: false,
          continueCursor: 'c1',
        },
      },
    ])
    optimisticallyUpdateValueInPaginatedQuery(store, listPaginated, { listId: 'L1' }, (item) => ({
      ...item,
      text: item.text.toUpperCase(),
    }))
    expect(store.setQuery).toHaveBeenCalledWith(
      listPaginated,
      expect.anything(),
      expect.objectContaining({
        page: [{ _id: '1', text: 'A' }],
      }),
    )
  })
})
