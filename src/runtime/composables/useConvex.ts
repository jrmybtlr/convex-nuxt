import type { ConvexClient } from 'convex/browser'
import { useConvexContext } from '../utils/context'

/**
 * Returns the browser ConvexClient. Throws if called during SSR.
 */
export function useConvex(): ConvexClient {
  const ctx = useConvexContext()
  if (!ctx.client) {
    throw new Error(
      '[convex-nuxt] useConvex() is only available in the browser. Use fetchQuery on the server.',
    )
  }
  return ctx.client
}
