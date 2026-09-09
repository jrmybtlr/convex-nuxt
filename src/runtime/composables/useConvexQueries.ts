import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import type { Value } from 'convex/values'
import {
  computed,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue'
import { useConvexContext } from '../utils/context'

export type ConvexQueriesRequest = Record<
  string,
  | {
    query: FunctionReference<'query'>
    args: Record<string, Value>
  }
  | 'skip'
>

export type ConvexQueriesResult<Request extends ConvexQueriesRequest> = {
  [K in keyof Request]: Request[K] extends {
    query: infer Query
    args: any
  }
    ? Query extends FunctionReference<'query'>
      ? FunctionReturnType<Query> | undefined | Error
      : undefined
    : undefined
}

/**
 * Subscribe to a dynamic map of Convex queries (React `useQueries` parity).
 *
 * Pass a reactive object whose values are `{ query, args }` or `'skip'`.
 * Returns a computed map of the same keys → result | `undefined` (loading) |
 * `Error`.
 *
 * Browser-only live subscriptions. During SSR every entry is `undefined`
 * (combine with `useConvexQuery` when you need SSR for known queries).
 */
export function useConvexQueries<Request extends ConvexQueriesRequest>(
  queries: MaybeRefOrGetter<Request>,
): ComputedRef<ConvexQueriesResult<Request>> {
  const ctx = useConvexContext()
  const results = shallowRef<Record<string, unknown>>({})

  if (import.meta.server || !ctx.client) {
    return computed(
      () => results.value as ConvexQueriesResult<Request>,
    )
  }

  const client = ctx.client
  const unsubscribers = new Map<string, () => void>()

  const sync = (request: Request) => {
    const nextKeys = new Set(Object.keys(request))

    for (const key of unsubscribers.keys()) {
      if (!nextKeys.has(key)) {
        unsubscribers.get(key)?.()
        unsubscribers.delete(key)
        const { [key]: _, ...rest } = results.value
        results.value = rest
      }
    }

    for (const [key, entry] of Object.entries(request)) {
      if (entry === 'skip') {
        unsubscribers.get(key)?.()
        unsubscribers.delete(key)
        if (key in results.value) {
          const { [key]: _, ...rest } = results.value
          results.value = rest
        }
        continue
      }

      // Drop previous subscription for this key before resubscribing.
      unsubscribers.get(key)?.()

      const { query, args } = entry
      const unsubscribe = client.onUpdate(
        query,
        args as FunctionArgs<typeof query>,
        (value) => {
          results.value = { ...results.value, [key]: value }
        },
        (err) => {
          results.value = { ...results.value, [key]: err }
        },
      )
      unsubscribers.set(key, unsubscribe)

      // Loading placeholder until the first update.
      if (!(key in results.value)) {
        results.value = { ...results.value, [key]: undefined }
      }
    }
  }

  watch(
    () => toValue(queries),
    (request) => {
      sync(request)
    },
    { immediate: true, deep: true },
  )

  onScopeDispose(() => {
    for (const unsubscribe of unsubscribers.values()) {
      unsubscribe()
    }
    unsubscribers.clear()
  })

  return computed(() => results.value as ConvexQueriesResult<Request>)
}
