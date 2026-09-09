import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useConvexContext } from '../utils/context'

/**
 * Browser mutation helper. Returns `{ mutate, error, pending }`.
 *
 * Safe to call during SSR setup — the ConvexClient is only touched when
 * `mutate()` runs in the browser.
 *
 * Note: `ConvexClient` does not support optimistic updates. Use the
 * low-level `BaseConvexClient` via `useConvex().client` if you need them.
 */
export function useConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
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
      return await ctx.client.mutation(mutation, toValue(args))
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
