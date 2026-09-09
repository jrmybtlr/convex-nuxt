import type { FunctionReference } from 'convex/server'
import { getFunctionName } from 'convex/server'
import { convexToJson } from 'convex/values'

/**
 * Stable Nuxt payload / useAsyncData key for a Convex query.
 *
 * `'skip'` means "don't fetch" — it must not change the key, otherwise
 * auth-gated queries lose the SSR payload on the client.
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
  const keyArgs = args === 'skip' ? {} : (args ?? {})
  const argsJson = convexToJson(keyArgs as never)
  return `convex:${name}:${JSON.stringify(argsJson)}`
}
