import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { createError, defineEventHandler, readBody } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { readHttpOnlyJwt, readHttpOnlyRefresh, setAuthCookies } from '../../../authCookies'
import { isHttpOnlyAuth, type ConvexAuthConfig } from '../../../../utils/authStorage'
import { assertSameOrigin } from '../../../sameOrigin'
import { MISSING_URL_HINT } from '../../../../utils/errors'

type AuthTokens = { token: string; refreshToken: string }

type SignInActionResult = {
  tokens?: AuthTokens | null
}

const authSignIn = makeFunctionReference<'action', { refreshToken?: string }, SignInActionResult>(
  'auth:signIn',
)

function convexUrl(event: Parameters<typeof useRuntimeConfig>[0]): string {
  const config = useRuntimeConfig(event)
  const url =
    (config.public?.convex as { url?: string } | undefined)?.url ??
    process.env.NUXT_PUBLIC_CONVEX_URL
  if (!url) {
    throw createError({
      statusCode: 500,
      message: MISSING_URL_HINT,
    })
  }
  return url
}

function requireHttpOnly(event: Parameters<typeof useRuntimeConfig>[0]) {
  const config = useRuntimeConfig(event)
  const auth = (config.public?.convex as { auth?: ConvexAuthConfig } | undefined)?.auth
  if (!isHttpOnlyAuth(auth)) {
    throw createError({
      statusCode: 404,
      message: 'HttpOnly auth is not enabled',
    })
  }
}

/**
 * Persist / read / refresh HttpOnly auth cookies.
 *
 * - GET → `{ hasSession }` only (no JWT in the response body)
 * - POST `{ getToken: true }` → `{ hasSession, token }` for ConvexClient.setAuth
 * - POST `{ refresh: true }` → refresh cookies, return `{ token }`
 * - POST `{ token, refreshToken }` → set cookies
 * - DELETE → clear cookies
 *
 * All methods require same-origin (fail-closed). Returning the JWT only via
 * POST reduces accidental leakage via prefetch/logs; XSS can still obtain a
 * token once ConvexClient needs it in memory — HttpOnly mitigates cookie theft,
 * not XSS session theft.
 */
export default defineEventHandler(async (event) => {
  requireHttpOnly(event)
  assertSameOrigin(event)

  if (event.method === 'GET') {
    const token = readHttpOnlyJwt(event)
    return {
      hasSession: !!token,
    }
  }

  if (event.method === 'DELETE') {
    setAuthCookies(event, { token: null })
    return { ok: true }
  }

  if (event.method === 'POST') {
    const body = await readBody<{
      token?: string | null
      refreshToken?: string | null
      refresh?: boolean
      getToken?: boolean
    }>(event)

    if (body?.getToken) {
      const token = readHttpOnlyJwt(event)
      return {
        hasSession: !!token,
        token: token ?? null,
      }
    }

    if (body?.refresh) {
      const refreshToken = readHttpOnlyRefresh(event)
      if (!refreshToken) {
        setAuthCookies(event, { token: null })
        return { token: null }
      }
      const http = new ConvexHttpClient(convexUrl(event))
      try {
        const result = await http.action(authSignIn, { refreshToken })
        const tokens = result.tokens ?? null
        if (!tokens) {
          setAuthCookies(event, { token: null })
          return { token: null }
        }
        setAuthCookies(event, {
          token: tokens.token,
          refreshToken: tokens.refreshToken,
        })
        return { token: tokens.token }
      } catch {
        setAuthCookies(event, { token: null })
        return { token: null }
      }
    }

    if (!body?.token) {
      setAuthCookies(event, { token: null })
      return { ok: true }
    }

    setAuthCookies(event, {
      token: body.token,
      refreshToken: body.refreshToken ?? null,
    })
    return { ok: true }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
