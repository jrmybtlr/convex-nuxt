import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import type { H3Event } from 'h3'
import { getCookie } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { createHttpClient } from '../utils/http'
import { resolveAuthCookieName } from '../utils/authStorage'
import { resolveFetchToken } from '../utils/fetchToken'

export { resolveFetchToken }

export interface ConvexFetchOptions {
  /**
   * Deployment URL. Defaults to `NUXT_PUBLIC_CONVEX_URL` / runtimeConfig.
   */
  url?: string
  /**
   * JWT for this call. Prefer per-request tokens — never put JWTs in public config.
   * When omitted and `event` is passed, falls back to `convex.auth.cookie` if set.
   */
  token?: string
  /**
   * Nitro/H3 event. Used to resolve runtimeConfig and the optional auth cookie.
   */
  event?: H3Event
  skipConvexDeploymentUrlCheck?: boolean
}

interface ConvexPublicConfig {
  url?: string
  auth?: { provider?: string, cookie?: string }
}

function readConvexConfig(event?: H3Event): ConvexPublicConfig | undefined {
  try {
    const config = useRuntimeConfig(event)
    return config.public?.convex as ConvexPublicConfig | undefined
  }
  catch {
    return undefined
  }
}

function resolveUrl(options: ConvexFetchOptions): string {
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

  throw new Error(
    '[convex-nuxt] No Convex URL. Pass { url } or set NUXT_PUBLIC_CONVEX_URL.',
  )
}

function resolveToken(options: ConvexFetchOptions): string | undefined {
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
    token: resolveToken(options),
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
export async function fetchQuery<Query extends FunctionReference<'query'>>(
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
export async function fetchMutation<Mutation extends FunctionReference<'mutation'>>(
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
export async function fetchAction<Action extends FunctionReference<'action'>>(
  action: Action,
  args?: FunctionArgs<Action>,
  options?: ConvexFetchOptions,
): Promise<FunctionReturnType<Action>> {
  const client = setupClient(options)
  return await client.action(action, (args ?? {}) as FunctionArgs<Action>)
}
