import { useConvexError } from './errors'

/**
 * Validate an OAuth redirect from Convex `auth:signIn`.
 * Only http(s) absolute URLs are allowed (blocks javascript:/data: etc.).
 */
export function parseOAuthRedirect(redirect: string): URL {
  let url: URL
  try {
    url = new URL(redirect)
  } catch {
    throw useConvexError('Invalid OAuth redirect URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw useConvexError('OAuth redirect must be http(s)')
  }
  return url
}
