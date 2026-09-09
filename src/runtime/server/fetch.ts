import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import { useRuntimeConfig } from 'nuxt/app'
import { createHttpClient } from '../utils/http'

export interface ConvexFetchOptions {
  /**
   * Deployment URL. Defaults to `NUXT_PUBLIC_CONVEX_URL` / runtimeConfig.
   */
  url?: string
  /**
   * JWT for this call. Prefer per-request tokens — never put JWTs in public config.
   */
  token?: string
  skipConvexDeploymentUrlCheck?: boolean
}

function resolveUrl(options: ConvexFetchOptions): string {
  if (options.url) {
    return options.url
  }

  try {
    const config = useRuntimeConfig()
    const url = (config.public.convex as { url?: string } | undefined)?.url
    if (url) {
      return url
    }
  }
  catch {
    // Outside Nuxt context — fall through to env.
  }

  const fromEnv = process.env.NUXT_PUBLIC_CONVEX_URL
  if (fromEnv) {
    return fromEnv
  }

  throw new Error(
    '[convex-nuxt] No Convex URL. Pass { url } or set NUXT_PUBLIC_CONVEX_URL.',
  )
}

function setupClient(options: ConvexFetchOptions = {}) {
  return createHttpClient(resolveUrl(options), {
    token: options.token,
    skipConvexDeploymentUrlCheck: options.skipConvexDeploymentUrlCheck,
  })
}

/**
 * One-shot query via ConvexHttpClient. Use in Nitro routes / server middleware.
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
