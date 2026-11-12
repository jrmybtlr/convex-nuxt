import type { H3Event } from 'h3'
import { createError, getCookie } from 'h3'
import { isJwtExpiring, isSsrConvexAuth, resolveAuthCookieName } from '../utils/authStorage'
import { resolveFetchToken } from '../utils/fetchToken'
import { readConvexConfig } from './convexConfig'

/**
 * Read the Convex JWT for this request.
 *
 * - Convex Auth (SSR mode): the access token the session middleware
 *   refreshed for this request, else the access-token cookie while valid.
 * - BYO providers: the configured `convex.auth.cookie`.
 *
 * Returns `undefined` when there is no session or auth cookies are disabled.
 */
export function getConvexToken(event: H3Event): string | undefined {
  const auth = readConvexConfig(event)?.auth
  if (isSsrConvexAuth(auth)) {
    const fromMiddleware = (event.context as { convexAuthToken?: string | null }).convexAuthToken
    if (fromMiddleware !== undefined) {
      return fromMiddleware ?? undefined
    }
  }
  const cookieName = resolveAuthCookieName(auth)
  if (!cookieName) {
    return undefined
  }
  const token = resolveFetchToken({
    cookieName,
    cookieValue: getCookie(event, cookieName),
  })
  if (token && isSsrConvexAuth(auth) && isJwtExpiring(token, 0)) {
    return undefined
  }
  return token
}

/**
 * Require a Convex JWT cookie on this Nitro request.
 * Throws an H3 401 when the cookie is missing.
 *
 * @example
 * ```ts
 * export default defineEventHandler(async (event) => {
 *   requireConvexAuth(event)
 *   return await fetchQuery(api.tasks.list, {}, { event })
 * })
 * ```
 */
export function requireConvexAuth(event: H3Event): string {
  const token = getConvexToken(event)
  if (!token) {
    throw createError({
      statusCode: 401,
      message: 'Not authenticated — sign in so the Convex auth cookie is set.',
    })
  }
  return token
}
