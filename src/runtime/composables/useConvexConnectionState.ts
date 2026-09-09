import type { ConnectionState } from 'convex/browser'
import { onScopeDispose, shallowRef, type ShallowRef } from 'vue'
import { useConvexContext } from '../utils/context'

export type { ConnectionState }

/**
 * Reactive WebSocket {@link ConnectionState} for the browser ConvexClient.
 * Returns `null` during SSR or when the client is unavailable.
 */
export function useConvexConnectionState(): ShallowRef<ConnectionState | null> {
  const state = shallowRef<ConnectionState | null>(null)

  if (import.meta.server) {
    return state
  }

  const ctx = useConvexContext()
  const client = ctx.client
  if (!client) {
    return state
  }

  state.value = client.connectionState()
  const unsubscribe = client.subscribeToConnectionState((next) => {
    state.value = next
  })
  onScopeDispose(() => {
    unsubscribe()
  })

  return state
}
