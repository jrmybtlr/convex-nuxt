import { ConvexHttpClient } from 'convex/browser'

export interface CreateHttpClientOptions {
  token?: string
  /**
   * Deploy / admin key for privileged HttpClient calls (Next.js
   * `fetchQuery(..., { adminToken })` parity). Uses `Authorization: Convex …`
   * and clears any user JWT. Prefer per-request secrets — never put this in
   * public runtime config.
   */
  adminToken?: string
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
    ...(options.token && !options.adminToken ? { auth: options.token } : {}),
  })

  if (options.adminToken) {
    // Runtime API (omitted from published .d.ts; same as convex/nextjs).
    ;(
      client as ConvexHttpClient & {
        setAdminAuth: (token: string) => void
      }
    ).setAdminAuth(options.adminToken)
  } else if (options.token) {
    client.setAuth(options.token)
  }

  // Present at runtime; used by convex/nextjs to avoid cached SSR responses.
  ;(
    client as ConvexHttpClient & {
      setFetchOptions: (init: RequestInit) => void
    }
  ).setFetchOptions({ cache: 'no-store' })

  return client
}
