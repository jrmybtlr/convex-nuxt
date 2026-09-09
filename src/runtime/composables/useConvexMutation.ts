import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import type { OptimisticUpdate } from 'convex/browser'
import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useConvexContext } from '../utils/context'

export type { OptimisticUpdate }

export interface UseConvexMutationOptions<
  Mutation extends FunctionReference<'mutation'>,
> {
  /**
   * Local query update applied while the mutation is in flight.
   * Passed through to `ConvexClient.mutation` → `BaseConvexClient`.
   */
  optimisticUpdate?: OptimisticUpdate<FunctionArgs<Mutation>>
}

/**
 * Browser mutation helper. Returns `{ mutate, error, pending }`.
 *
 * Safe to call during SSR setup — the ConvexClient is only touched when
 * `mutate()` runs in the browser.
 *
 * Pass `{ optimisticUpdate }` to apply temporary local query results while
 * the mutation is in flight (same contract as React `withOptimisticUpdate`).
 */
export function useConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  options: UseConvexMutationOptions<Mutation> = {},
) {
  const ctx = useConvexContext()
  const error = ref<Error | null>(null)
  const pendingCount = ref(0)

  const mutate = async (
    args: MaybeRefOrGetter<FunctionArgs<Mutation>> = {} as FunctionArgs<Mutation>,
  ): Promise<FunctionReturnType<Mutation>> => {
    if (import.meta.server || !ctx.client) {
      throw new Error(
        '[convex-nuxt] useConvexMutation can only run in the browser.',
      )
    }
    pendingCount.value++
    error.value = null
    try {
      const resolved = toValue(args)
      return await ctx.client.mutation(
        mutation,
        resolved,
        options.optimisticUpdate
          ? { optimisticUpdate: options.optimisticUpdate }
          : undefined,
      )
    }
    catch (cause) {
      const err = cause instanceof Error ? cause : new Error(String(cause))
      error.value = err
      throw err
    }
    finally {
      pendingCount.value--
    }
  }

  return {
    mutate,
    error,
    pending: computed(() => pendingCount.value > 0),
  }
}
