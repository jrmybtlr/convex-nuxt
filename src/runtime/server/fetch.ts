import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import type { H3Event } from 'h3'
import { getCookie } from 'h3'
import { createHttpClient } from '../utils/http'
import { resolveAuthCookieName } from '../utils/authStorage'
import type { ConvexRef } from '../utils/functionReference'
import { resolveFetchToken } from '../utils/fetchToken'
import { missingConvexUrlError } from '../utils/errors'
import { readConvexConfig } from './convexConfig'

export interface ConvexFetchOptions {
  /**
   * Deployment URL. Defaults to `NUXT_PUBLIC_CONVEX_URL` / runtimeConfig.
   */
  url?: string
  /**
   * JWT for this call. Prefer per-request tokens — never put JWTs in public config.
   * When omitted and `event` is passed, falls back to `convex.auth.cookie` if set.
   * Ignored when {@link adminToken} is set (admin auth clears user JWT).
   */
  token?: string
  /**
   * Deploy / admin key for privileged server tooling (Next.js `fetchQuery`
   * parity). Calls `ConvexHttpClient.setAdminAuth`. Never put this in public
   * runtime config — pass per request from a server secret.
   */
  adminToken?: string
  /**
   * Nitro/H3 event. Used to resolve runtimeConfig and the optional auth cookie.
   */
  event?: H3Event
  skipConvexDeploymentUrlCheck?: boolean
}

/** @internal */
export function resolveUrl(options: ConvexFetchOptions): string {
  if (options.url) {
    return options.url
  }

  const fromConfig = readConvexConfig(options.event)?.url
  if (fromConfig) {
    return fromConfig
  }

  const fromEnv = process.env.NUXT_PUBLIC_CONVEX_URL
  if (fromEnv) {
    return fromEnv
  }

  throw missingConvexUrlError('fetchQuery/Mutation/Action')
}

/** @internal */
export function resolveToken(options: ConvexFetchOptions): string | undefined {
  if (options.token !== undefined) {
    return resolveFetchToken({ token: options.token })
  }

  const cookieName = resolveAuthCookieName(readConvexConfig(options.event)?.auth)
  if (!cookieName || !options.event) {
    return undefined
  }

  return resolveFetchToken({
    cookieName,
    cookieValue: getCookie(options.event, cookieName),
  })
}

function setupClient(options: ConvexFetchOptions = {}) {
  return createHttpClient(resolveUrl(options), {
    token: options.adminToken ? undefined : resolveToken(options),
    adminToken: options.adminToken,
    skipConvexDeploymentUrlCheck: options.skipConvexDeploymentUrlCheck,
  })
}

/**
 * One-shot query via ConvexHttpClient. Use in Nitro routes / server middleware.
 *
 * @example
 * ```ts
 * export default defineEventHandler(async (event) => {
 *   return await fetchQuery(api.tasks.list, {}, { event })
 * })
 * ```
 */
export async function fetchQuery<Query extends ConvexRef<'query'>>(
  query: Query,
  args?: FunctionArgs<Query>,
  options?: ConvexFetchOptions,
): Promise<FunctionReturnType<Query>> {
  const client = setupClient(options)
  return await client.query(query, (args ?? {}) as FunctionArgs<Query>)
}

/**
 * One-shot mutation via ConvexHttpClient. Use in Nitro routes / server middleware.
 */
export async function fetchMutation<Mutation extends ConvexRef<'mutation'>>(
  mutation: Mutation,
  args?: FunctionArgs<Mutation>,
  options?: ConvexFetchOptions,
): Promise<FunctionReturnType<Mutation>> {
  const client = setupClient(options)
  return await client.mutation(mutation, (args ?? {}) as FunctionArgs<Mutation>, {
    skipQueue: true,
  })
}

/**
 * One-shot action via ConvexHttpClient. Use in Nitro routes / server middleware.
 */
export async function fetchAction<Action extends ConvexRef<'action'>>(
  action: Action,
  args?: FunctionArgs<Action>,
  options?: ConvexFetchOptions,
): Promise<FunctionReturnType<Action>> {
  const client = setupClient(options)
  return await client.action(action, (args ?? {}) as FunctionArgs<Action>)
}
