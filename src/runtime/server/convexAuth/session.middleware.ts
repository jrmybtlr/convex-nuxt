import { defineEventHandler, getCookie, getRequestURL } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import {
  CONVEX_AUTH_JWT_COOKIE,
  CONVEX_AUTH_REFRESH_COOKIE,
  DEFAULT_AUTH_ROUTE_PREFIX,
  isJwtExpiring,
  type ConvexAuthConfig,
} from '../../utils/authStorage'
import { createServerAuthSession } from './setup'

/**
 * Resolve the Convex Auth access token for this request (SSR mode).
 *
 * Access tokens live ~60s, so most page loads find an expired one: refresh
 * from the httpOnly refresh cookie, rotate both cookies on the response, and
 * leave the fresh token on `event.context.convexAuthToken` for SSR queries,
 * `getConvexToken`, and the Nitro `fetch*` helpers.
 */
export default defineEventHandler(async (event) => {
  const context = event.context as { convexAuthToken?: string | null }
  if (context.convexAuthToken !== undefined) {
    return
  }

  const pathname = getRequestURL(event).pathname
  const config = useRuntimeConfig(event)
  const baseURL = (config.app?.baseURL ?? '/').replace(/\/+$/, '')
  const auth = (config.public?.convex as { auth?: ConvexAuthConfig } | undefined)?.auth
  const prefix = baseURL + (auth?.routePrefix ?? DEFAULT_AUTH_ROUTE_PREFIX).replace(/\/+$/, '')
  if (
    pathname.startsWith(prefix + '/') ||
    pathname.startsWith(`${baseURL}/_nuxt/`) ||
    pathname.startsWith(`${baseURL}/__nuxt`) ||
    // Static assets (`/favicon.ico`, `/robots.txt`, …) never need a session.
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return
  }

  const jwt = getCookie(event, CONVEX_AUTH_JWT_COOKIE) || null
  const refresh = getCookie(event, CONVEX_AUTH_REFRESH_COOKIE) || null
  if (refresh === null) {
    context.convexAuthToken = jwt !== null && !isJwtExpiring(jwt, 0) ? jwt : null
    return
  }

  try {
    context.convexAuthToken = await createServerAuthSession(event).getToken()
  } catch {
    // Convex unreachable: keep the cookies for the next request, and only
    // use the access token if it is still valid.
    context.convexAuthToken = jwt !== null && !isJwtExpiring(jwt, 0) ? jwt : null
  }
})
