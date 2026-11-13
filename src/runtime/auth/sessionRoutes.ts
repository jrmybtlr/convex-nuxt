/** Client side of the Nitro Convex Auth routes (SSR mode). */

export type AuthSessionResponse = { tokens: { accessToken: string; userId: string } | null }

function isSessionResponse(body: unknown): body is AuthSessionResponse {
  if (typeof body !== 'object' || body === null || !('tokens' in body)) {
    return false
  }
  const tokens = (body as { tokens: unknown }).tokens
  return (
    tokens === null ||
    (typeof tokens === 'object' &&
      typeof (tokens as { accessToken?: unknown }).accessToken === 'string' &&
      typeof (tokens as { userId?: unknown }).userId === 'string')
  )
}

/**
 * POST to the SSR refresh / sign-out route.
 *
 * Accepts a 2xx `{ tokens }` body, and the documented 401 `{ tokens: null }`
 * for a dead session. Anything else (a proxy's HTML 502, a 403 origin
 * refusal, a malformed body) throws, so a temporary outage is not mistaken
 * for "signed out" and the stored session is kept for the next attempt.
 */
export async function postAuth(route: string): Promise<AuthSessionResponse> {
  const res = await fetch(route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    credentials: 'same-origin',
  })
  const body: unknown = await res.json().catch(() => undefined)
  if (isSessionResponse(body) && (res.ok || (res.status === 401 && body.tokens === null))) {
    return body
  }
  throw new Error(`[use-convex] ${route} failed with ${res.status}`)
}

type TokenFetcher = (args: { forceRefreshToken: boolean }) => Promise<string | null | undefined>

/**
 * Wrap a token fetcher so it never rejects.
 *
 * `ConvexClient` does not catch a throwing fetcher: a refresh that fails
 * during an outage would leave the socket paused with no further refresh
 * scheduled. Instead, retry with capped exponential backoff until the
 * refresh gives a real answer (a token, or `null` for "no session"), and
 * stop early once the session is gone locally (e.g. the user signed out).
 */
export function retryingTokenFetcher(
  fetchToken: TokenFetcher,
  options: {
    hasSession: () => boolean
    onRetry?: (error: unknown, delayMs: number) => void
    sleep?: (ms: number) => Promise<void>
    maxDelayMs?: number
  },
): (args: { forceRefreshToken: boolean }) => Promise<string | null> {
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const maxDelayMs = options.maxDelayMs ?? 30_000
  return async (args) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return (await fetchToken(args)) ?? null
      } catch (error) {
        if (!options.hasSession()) {
          return null
        }
        const delayMs = Math.min(1000 * 2 ** attempt, maxDelayMs)
        options.onRetry?.(error, delayMs)
        await sleep(delayMs)
        if (!options.hasSession()) {
          return null
        }
      }
    }
  }
}
