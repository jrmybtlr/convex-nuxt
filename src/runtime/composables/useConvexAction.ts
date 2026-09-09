import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useConvexContext } from '../utils/context'

/**
 * Browser action helper. Returns `{ run, error, pending }`.
 *
 * Safe to call during SSR setup — the ConvexClient is only touched when
 * `run()` runs in the browser.
 */
export function useConvexAction<Action extends FunctionReference<'action'>>(
  action: Action,
) {
  const ctx = useConvexContext()
  const error = ref<Error | null>(null)
  const pendingCount = ref(0)

  const run = async (
    args: MaybeRefOrGetter<FunctionArgs<Action>> = {} as FunctionArgs<Action>,
  ): Promise<FunctionReturnType<Action>> => {
    if (import.meta.server || !ctx.client) {
      throw new Error(
        '[convex-nuxt] useConvexAction can only run in the browser.',
      )
    }
    pendingCount.value++
    error.value = null
    try {
      return await ctx.client.action(action, toValue(args))
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
    run,
    error,
    pending: computed(() => pendingCount.value > 0),
  }
}
