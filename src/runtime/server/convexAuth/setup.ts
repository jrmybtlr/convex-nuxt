import {
  ServerAuthSession,
  setupConvexAuthServer,
  type AuthCookieOptions,
  type CookieStore,
} from '@convex-dev/auth/ssr'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import type { H3Event } from 'h3'
import {
  createError,
  deleteCookie,
  getCookie,
  getRequestHeader,
  sendWebResponse,
  setCookie,
  toWebRequest,
} from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { MISSING_URL_HINT } from '../../utils/errors'
import { resolveAuthApiNames, type ConvexAuthConfig } from '../../utils/authStorage'

/** Server-only Convex Auth options (`runtimeConfig.convexAuth`). */
export interface ConvexAuthServerRuntimeConfig {
  /** Sign-in function names the auth proxy forwards, e.g. `'auth:signInWithUsernamePassword'`. */
  signIn?: string[]
  /** Origins trusted besides the request's own Host. */
  allowedOrigins?: string[]
  /** Cookie attributes. `secure` defaults to true except on localhost. */
  cookie?: { secure?: boolean; domain?: string; path?: string }
}

type Resolved = {
  convexUrl: string
  auth: ConvexAuthConfig | undefined
  server: ConvexAuthServerRuntimeConfig
}

function resolveConfig(event: H3Event): Resolved {
  const config = useRuntimeConfig(event)
  const pub = config.public?.convex as { url?: string; auth?: ConvexAuthConfig } | undefined
  const convexUrl = pub?.url ?? process.env.NUXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    throw createError({ statusCode: 500, message: MISSING_URL_HINT })
  }
  return {
    convexUrl,
    auth: pub?.auth,
    server: ((config as { convexAuth?: ConvexAuthServerRuntimeConfig }).convexAuth ??
      {}) as ConvexAuthServerRuntimeConfig,
  }
}

function isLocalHost(event: H3Event): boolean {
  const host = getRequestHeader(event, 'host') ?? ''
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')
}

export function resolveCookieOptions(
  event: H3Event,
  server: ConvexAuthServerRuntimeConfig,
): AuthCookieOptions {
  return {
    secure: server.cookie?.secure ?? !isLocalHost(event),
    ...(server.cookie?.domain ? { domain: server.cookie.domain } : {}),
    ...(server.cookie?.path ? { path: server.cookie.path } : {}),
  }
}

type Handlers = ReturnType<typeof setupConvexAuthServer>
const cache = new Map<string, Handlers>()

/**
 * `setupConvexAuthServer` built from runtime config, cached per
 * deployment + cookie attributes (`secure` differs on localhost).
 */
export function useConvexAuthServer(event: H3Event): Handlers {
  const { convexUrl, auth, server } = resolveConfig(event)
  const cookieOptions = resolveCookieOptions(event, server)
  const api = resolveAuthApiNames(auth)
  const key = JSON.stringify([convexUrl, api, server, cookieOptions])
  let handlers = cache.get(key)
  if (!handlers) {
    handlers = setupConvexAuthServer({
      convexUrl,
      refreshSession: makeFunctionReference<'mutation'>(api.refreshSession) as never,
      signOut: makeFunctionReference<'mutation'>(api.signOut) as never,
      signIn: (server.signIn ?? []).map((name) => makeFunctionReference<'mutation'>(name)) as never,
      cookieOptions,
      ...(server.allowedOrigins?.length ? { allowedOrigins: server.allowedOrigins } : {}),
    })
    cache.set(key, handlers)
  }
  return handlers
}

/** Run a WHATWG handler from `@convex-dev/auth/ssr` on an H3 event. */
export async function runWebHandler(
  event: H3Event,
  handler: (request: Request) => Promise<Response>,
): Promise<void> {
  const response = await handler(toWebRequest(event))
  return sendWebResponse(event, response)
}

/** `CookieStore` over H3 request/response cookies. */
export function h3CookieStore(event: H3Event): CookieStore {
  return {
    get: (name) => getCookie(event, name) || undefined,
    set: (name, value, options) => {
      setCookie(event, name, value, options)
    },
    delete: (name, options) => {
      deleteCookie(event, name, options)
    },
  }
}

/**
 * A `ServerAuthSession` for this request: reads the access/refresh cookies,
 * refreshes when the access token is missing or near expiry, and writes the
 * rotated cookies onto the response.
 */
export function createServerAuthSession(event: H3Event): ServerAuthSession {
  const { convexUrl, auth, server } = resolveConfig(event)
  const api = resolveAuthApiNames(auth)
  const http = new ConvexHttpClient(convexUrl)
  const refreshSession = makeFunctionReference<'mutation'>(api.refreshSession)
  return new ServerAuthSession({
    refreshSession: (refreshToken) => http.mutation(refreshSession, { refreshToken }),
    cookies: h3CookieStore(event),
    cookieOptions: resolveCookieOptions(event, server),
  })
}
