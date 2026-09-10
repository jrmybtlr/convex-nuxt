import {
  createError,
  getRequestHeader,
  getRequestProtocol,
  type H3Event,
} from 'h3'

/**
 * Fail-closed same-origin guard for cookie-bearing auth routes.
 *
 * Accepts the request when:
 * - `Sec-Fetch-Site` is `same-origin` or `none` (user-initiated / same origin), or
 * - `Origin` matches the trusted request origin (scheme + host), using
 *   `Host` and `getRequestProtocol` (honors `X-Forwarded-Proto` behind proxies).
 *
 * Rejects when `Sec-Fetch-Site` is `cross-site` / `same-site`, or when neither
 * signal can confirm same-origin. Missing both headers is rejected.
 * Scheme-mismatched Origins (e.g. `http://` vs HTTPS request) are rejected.
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
      const originUrl = new URL(origin)
      // Trust proxy scheme so HTTPS apps behind TLS terminators still match.
      const protocol = getRequestProtocol(event, { xForwardedProto: true })
      if (
        originUrl.protocol === `${protocol}:`
        && originUrl.host === host
      ) {
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
