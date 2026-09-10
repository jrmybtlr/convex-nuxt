import { createError, getRequestHeader, type H3Event } from 'h3'

/**
 * Fail-closed same-origin guard for cookie-bearing auth routes.
 *
 * Accepts the request when:
 * - `Sec-Fetch-Site` is `same-origin` or `none` (user-initiated / same origin), or
 * - `Origin` is present and its host matches `Host` (fallback for clients that
 *   omit `Sec-Fetch-Site`, e.g. some test runners).
 *
 * Rejects when `Sec-Fetch-Site` is `cross-site` / `same-site`, or when neither
 * signal can confirm same-origin. Missing both headers is rejected.
 */
export function assertSameOrigin(event: H3Event): void {
  const secFetchSite = getRequestHeader(event, 'sec-fetch-site')
  if (secFetchSite === 'same-origin' || secFetchSite === 'none') {
    return
  }
  if (
    secFetchSite === 'cross-site'
    || secFetchSite === 'same-site'
  ) {
    throw createError({
      statusCode: 403,
      message: 'Forbidden',
    })
  }

  const origin = getRequestHeader(event, 'origin')
  const host = getRequestHeader(event, 'host')
  if (origin && host) {
    try {
      if (new URL(origin).host === host) {
        return
      }
    }
    catch {
      // Invalid Origin → reject below.
    }
  }

  throw createError({
    statusCode: 403,
    message: 'Forbidden',
  })
}
