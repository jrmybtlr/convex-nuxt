import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { OptimisticUpdate } from 'convex/browser'
import { toValue, type MaybeRefOrGetter } from 'vue'
import { useConvexContext } from '../utils/context'
import { createPendingErrorState } from '../utils/pendingError'

export type { OptimisticUpdate }

export interface UseConvexMutationOptions<Mutation extends FunctionReference<'mutation'>> {
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
  const { error, pending, withPending } = createPendingErrorState()

  const mutate = async (
    args: MaybeRefOrGetter<FunctionArgs<Mutation>> = {} as FunctionArgs<Mutation>,
  ): Promise<FunctionReturnType<Mutation>> => {
    if (import.meta.server || !ctx.client) {
      throw new Error('[use-convex] useConvexMutation can only run in the browser.')
    }
    return await withPending(async () => {
      const resolved = toValue(args)
      return await ctx.client!.mutation(
        mutation,
        resolved,
        options.optimisticUpdate ? { optimisticUpdate: options.optimisticUpdate } : undefined,
      )
    })
  }

  return {
    mutate,
    error,
    pending,
  }
}
