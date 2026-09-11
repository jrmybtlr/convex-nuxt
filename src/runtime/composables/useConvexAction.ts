import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { toValue, type MaybeRefOrGetter } from 'vue'
import { useConvexContext } from '../utils/context'
import { createPendingErrorState } from '../utils/pendingError'

/**
 * Browser action helper. Returns `{ run, error, pending }`.
 *
 * Safe to call during SSR setup — the ConvexClient is only touched when
 * `run()` runs in the browser.
 */
export function useConvexAction<Action extends FunctionReference<'action'>>(action: Action) {
  const ctx = useConvexContext()
  const { error, pending, withPending } = createPendingErrorState()

  const run = async (
    args: MaybeRefOrGetter<FunctionArgs<Action>> = {} as FunctionArgs<Action>,
  ): Promise<FunctionReturnType<Action>> => {
    if (import.meta.server || !ctx.client) {
      throw new Error('[use-convex] useConvexAction can only run in the browser.')
    }
    return await withPending(() => ctx.client!.action(action, toValue(args)))
  }

  return {
    run,
    error,
    pending,
  }
}
