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
