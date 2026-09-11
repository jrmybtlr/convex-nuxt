import type { FunctionArgs, FunctionReference } from 'convex/server'
import { onScopeDispose } from 'vue'
import { useConvex } from './useConvex'

/**
 * Start a live subscription early so the first `useConvexQuery` / screen
 * paint can reuse warm client state (React `prewarmQuery` parity).
 *
 * Returns an unsubscribe function. When called during Vue `setup`, the
 * subscription is also cleaned up with the current effect scope.
 */
export function prewarmQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query> = {} as FunctionArgs<Query>,
): () => void {
  const client = useConvex()
  const unsubscribe = client.onUpdate(query, args, () => {})

  try {
    onScopeDispose(() => {
      unsubscribe()
    })
  } catch {
    // Called outside setup — caller owns the unsubscribe.
  }

  return unsubscribe
}
