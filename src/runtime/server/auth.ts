import type { H3Event } from 'h3'
import { createError, getCookie } from 'h3'
import { resolveAuthCookieName } from '../utils/authStorage'
import { resolveFetchToken } from '../utils/fetchToken'
import { readConvexConfig } from './convexConfig'

/**
 * Read the Convex JWT from the configured auth cookie on this request.
 * Returns `undefined` when the cookie is missing or auth cookies are disabled.
 */
export function getConvexToken(event: H3Event): string | undefined {
  const cookieName = resolveAuthCookieName(readConvexConfig(event)?.auth)
  if (!cookieName) {
    return undefined
  }
  return resolveFetchToken({
    cookieName,
    cookieValue: getCookie(event, cookieName),
  })
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
      message:
        'Not authenticated — sign in so the Convex auth cookie is set.',
    })
  }
  return token
}
