/**
 * Resolve the JWT for a Nitro `fetch*` call.
 * Explicit `token` wins; otherwise use the cookie value from the event.
 */
export function resolveFetchToken(options: {
  token?: string
  cookieName?: string
  cookieValue?: string | null
}): string | undefined {
  if (options.token !== undefined) {
    return options.token || undefined
  }
  return options.cookieValue || undefined
}
