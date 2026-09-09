import { ConvexHttpClient } from 'convex/browser'

export interface CreateHttpClientOptions {
  token?: string
  skipConvexDeploymentUrlCheck?: boolean
}

/**
 * Construct a fresh ConvexHttpClient for a single request.
 * Matches the convex/nextjs pattern: new client, optional auth, no-store fetch.
 */
export function createHttpClient(
  url: string,
  options: CreateHttpClientOptions = {},
): ConvexHttpClient {
  const client = new ConvexHttpClient(url, {
    skipConvexDeploymentUrlCheck: options.skipConvexDeploymentUrlCheck,
    ...(options.token ? { auth: options.token } : {}),
  })

  if (options.token) {
    client.setAuth(options.token)
  }

  // Present at runtime; used by convex/nextjs to avoid cached SSR responses.
  ;(client as ConvexHttpClient & {
    setFetchOptions: (init: RequestInit) => void
  }).setFetchOptions({ cache: 'no-store' })

  return client
}
