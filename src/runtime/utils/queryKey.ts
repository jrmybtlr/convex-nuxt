import type { FunctionReference } from 'convex/server'
import { getFunctionName } from 'convex/server'
import { convexToJson } from 'convex/values'

/**
 * Stable Nuxt payload / useAsyncData key for a Convex query.
 */
export function convexQueryKey(
  query: FunctionReference<'query'>,
  args: unknown,
  explicitKey?: string,
): string {
  if (explicitKey) {
    return explicitKey
  }

  const name = getFunctionName(query)
  if (args === 'skip') {
    return `convex:${name}:skip`
  }

  const argsJson = convexToJson((args ?? {}) as never)
  return `convex:${name}:${JSON.stringify(argsJson)}`
}
