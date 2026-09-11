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

export function unreachableConvexUrlError(convexUrl: string): Error {
  return useConvexError(
    `Could not reach Convex at ${convexUrl}. If you switched from a local to a cloud deployment, set CONVEX_URL and NUXT_PUBLIC_CONVEX_URL in .env.local to the URL printed by \`npx convex dev\` and restart Nuxt. If you use a local backend, keep \`npx convex dev\` running.`,
  )
}

export function warnStaleLocalConvexUrl(localUrl: string, cloudUrl: string): void {
  console.warn(
    `${USE_CONVEX_PREFIX} Convex URL is ${localUrl} but CONVEX_DEPLOYMENT is a cloud deployment. The Convex CLI could not update .env.local — set CONVEX_URL and NUXT_PUBLIC_CONVEX_URL to ${cloudUrl} and restart Nuxt.`,
  )
}
