/**
 * Consistent, actionable errors for consumers of `use-convex`.
 *
 * Branding uses `[use-convex]` (package name). Older `[use-convex]` strings
 * are migrated here so setup failures point to the same fix.
 */

export const USE_CONVEX_PREFIX = '[use-convex]'

/** Missing deployment URL — the most common first-run failure. */
export const MISSING_URL_HINT =
  'Set convex.url in nuxt.config or NUXT_PUBLIC_CONVEX_URL (runtimeConfig.public.convex.url).'

export function useConvexError(message: string): Error {
  const text = message.startsWith(USE_CONVEX_PREFIX) ? message : `${USE_CONVEX_PREFIX} ${message}`
  return new Error(text)
}

export function missingConvexUrlError(context?: string): Error {
  const where = context ? `${context}: ` : ''
  return useConvexError(`${where}No Convex URL. ${MISSING_URL_HINT}`)
}

export function warnMissingConvexUrl(scope: 'client' | 'server'): void {
  console.warn(
    `${USE_CONVEX_PREFIX} No Convex URL on ${scope}. ${MISSING_URL_HINT} The module no-ops until a URL is set.`,
  )
}
