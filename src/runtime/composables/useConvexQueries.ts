import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import { getFunctionName } from 'convex/server'
import type { Value } from 'convex/values'
import { convexToJson } from 'convex/values'
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

function subscriptionSignature(
  query: FunctionReference<'query'>,
  args: Record<string, Value>,
): string {
  return `${getFunctionName(query)}:${JSON.stringify(convexToJson(args))}`
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
 *
 * Unchanged keys (same function name + args) keep their existing subscription
 * so deep reactive churn does not tear down WebSocket watches.
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
  const signatures = new Map<string, string>()

  const dropKey = (key: string) => {
    unsubscribers.get(key)?.()
    unsubscribers.delete(key)
    signatures.delete(key)
    if (key in results.value) {
      const { [key]: _, ...rest } = results.value
      results.value = rest
    }
  }

  const sync = (request: Request) => {
    const nextKeys = new Set(Object.keys(request))

    for (const key of unsubscribers.keys()) {
      if (!nextKeys.has(key)) {
        dropKey(key)
      }
    }

    for (const [key, entry] of Object.entries(request)) {
      if (entry === 'skip') {
        dropKey(key)
        continue
      }

      const { query, args } = entry
      const signature = subscriptionSignature(query, args)
      if (
        signatures.get(key) === signature
        && unsubscribers.has(key)
      ) {
        continue
      }

      unsubscribers.get(key)?.()

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
      signatures.set(key, signature)

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
    signatures.clear()
  })

  return computed(() => results.value as ConvexQueriesResult<Request>)
}
