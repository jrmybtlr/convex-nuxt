import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import {
  createError,
  defineEventHandler,
  getRequestHeader,
  readBody,
} from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import {
  readHttpOnlyJwt,
  readHttpOnlyRefresh,
  setAuthCookies,
} from '../authCookies'
import { isHttpOnlyAuth, type ConvexAuthConfig } from '../../utils/authStorage'

type AuthTokens = { token: string, refreshToken: string }

type SignInActionResult = {
  tokens?: AuthTokens | null
}

const authSignIn = makeFunctionReference<
  'action',
  { refreshToken?: string },
  SignInActionResult
>('auth:signIn')

function convexUrl(event: Parameters<typeof useRuntimeConfig>[0]): string {
  const config = useRuntimeConfig(event)
  const url = (config.public?.convex as { url?: string } | undefined)?.url
    ?? process.env.NUXT_PUBLIC_CONVEX_URL
  if (!url) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Convex URL is not configured',
    })
  }
  return url
}

function requireHttpOnly(event: Parameters<typeof useRuntimeConfig>[0]) {
  const config = useRuntimeConfig(event)
  const auth = (config.public?.convex as { auth?: ConvexAuthConfig } | undefined)
    ?.auth
  if (!isHttpOnlyAuth(auth)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'HttpOnly auth is not enabled',
    })
  }
}

function assertSameOrigin(event: Parameters<typeof getRequestHeader>[0]) {
  const secFetchSite = getRequestHeader(event, 'sec-fetch-site')
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
    })
  }
}

/**
 * Persist tokens into HttpOnly cookies (called after client signIn).
 * Body: `{ token, refreshToken } | null` to clear.
 */
export default defineEventHandler(async (event) => {
  requireHttpOnly(event)
  assertSameOrigin(event)

  if (event.method === 'GET') {
    const token = readHttpOnlyJwt(event)
    return {
      hasSession: !!token,
      // Token only for same-origin fetchToken — never embed in HTML.
      token: token ?? null,
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
    }>(event)

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
      }
      catch {
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

  throw createError({ statusCode: 405, statusMessage: 'Method not allowed' })
})
