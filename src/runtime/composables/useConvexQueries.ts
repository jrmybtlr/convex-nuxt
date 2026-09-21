import type { FunctionArgs, FunctionReturnType } from 'convex/server'
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
import { resolveAuthGatedArgs } from '../utils/authGate'
import { useConvexContext } from '../utils/context'
import type { ConvexRef } from '../utils/functionReference'

/** One entry in a {@link useConvexQueries} request map. */
export type ConvexQueryRequestEntry<Query extends ConvexRef<'query'> = ConvexRef<'query'>> = {
  query: Query
  args: FunctionArgs<Query>
  /**
   * Skip this entry until Convex confirms auth (`isAuthenticated`).
   * Overrides the top-level {@link UseConvexQueriesOptions.authenticated}
   * flag when set.
   */
  authenticated?: boolean
}

/**
 * Request map for {@link useConvexQueries}.
 * Values are `{ query, args, authenticated? }` or `'skip'`.
 */
export type ConvexQueriesRequest = Record<string, ConvexQueryRequestEntry | 'skip'>

export type ConvexQueriesResult<Request extends ConvexQueriesRequest> = {
  [K in keyof Request]: Request[K] extends {
    query: infer Query
    args: infer _Args
  }
    ? Query extends ConvexRef<'query'>
      ? FunctionReturnType<Query> | undefined | Error
      : undefined
    : undefined
}

export interface UseConvexQueriesOptions {
  /**
   * Skip every entry until Convex confirms auth (`isAuthenticated`).
   * Prefer this over wrapping each value in `'skip'`. Per-entry
   * `authenticated` overrides this when set.
   *
   * @default false
   */
  authenticated?: boolean
}

function subscriptionSignature(
  query: ConvexRef<'query'>,
  args: Record<string, Value>,
  authSkipped: boolean,
): string {
  return `${getFunctionName(query)}:${JSON.stringify(convexToJson(args))}:authSkip=${authSkipped}`
}

function entryRequiresAuth(entry: ConvexQueryRequestEntry, defaultAuthenticated: boolean): boolean {
  return entry.authenticated ?? defaultAuthenticated
}

/**
 * Subscribe to a dynamic map of Convex queries (React `useQueries` parity).
 *
 * Pass a reactive object whose values are `{ query, args, authenticated? }`
 * or `'skip'`. Returns a computed map of the same keys → result |
 * `undefined` (loading) | `Error`.
 *
 * Browser-only live subscriptions. During SSR every entry is `undefined`
 * (combine with `useConvexQuery` when you need SSR for known queries).
 *
 * Unchanged keys (same function name + args + auth-skip) keep their
 * existing subscription so deep reactive churn does not tear down
 * WebSocket watches.
 *
 * @example
 * ```ts
 * // Gate the whole map until Convex confirms auth
 * const results = useConvexQueries(
 *   () => ({
 *     tasks: { query: api.tasks.list, args: {} },
 *     files: showFiles.value ? { query: api.files.list, args: {} } : 'skip',
 *   }),
 *   { authenticated: true },
 * )
 * ```
 */
export function useConvexQueries<Request extends ConvexQueriesRequest>(
  queries: MaybeRefOrGetter<Request>,
  options: UseConvexQueriesOptions = {},
): ComputedRef<ConvexQueriesResult<Request>> {
  const ctx = useConvexContext()
  const results = shallowRef<Record<string, unknown>>({})
  const defaultAuthenticated = options.authenticated ?? false

  if (import.meta.server || !ctx.client) {
    return computed(() => results.value as ConvexQueriesResult<Request>)
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

  const sync = (request: Request, isAuthenticated: boolean) => {
    const nextKeys = new Set(Object.keys(request))
    const known = new Set<string>([...unsubscribers.keys(), ...signatures.keys()])

    for (const key of known) {
      if (!nextKeys.has(key)) {
        dropKey(key)
      }
    }

    for (const [key, entry] of Object.entries(request)) {
      if (entry === 'skip') {
        dropKey(key)
        continue
      }

      const requireAuth = entryRequiresAuth(entry, defaultAuthenticated)
      const effectiveArgs = resolveAuthGatedArgs(entry.args, {
        authenticated: requireAuth,
        isAuthenticated,
      })
      const authSkipped = effectiveArgs === 'skip'

      const signature = subscriptionSignature(
        entry.query,
        entry.args as Record<string, Value>,
        authSkipped,
      )
      // Auth-skipped keys have a signature and no subscriber. Treat that as
      // settled so a deep watch does not tear the entry down every tick.
      if (signatures.get(key) === signature && (unsubscribers.has(key) || authSkipped)) {
        continue
      }

      unsubscribers.get(key)?.()
      unsubscribers.delete(key)

      if (authSkipped) {
        signatures.set(key, signature)
        if (key in results.value) {
          const { [key]: _, ...rest } = results.value
          results.value = rest
        }
        continue
      }

      const unsubscribe = client.onUpdate(
        entry.query,
        effectiveArgs as FunctionArgs<typeof entry.query>,
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
    () => [toValue(queries), ctx.auth.isAuthenticated.value] as const,
    ([request, isAuthenticated]) => {
      sync(request, isAuthenticated)
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
