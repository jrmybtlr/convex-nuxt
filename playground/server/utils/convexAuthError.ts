/**
 * Map Convex auth failures from `fetch*` helpers to an H3 401.
 * Other errors are rethrown unchanged.
 */
export function rethrowConvexAuthError(cause: unknown): never {
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/auth|unauthor|not authenticated/i.test(message)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sign in on the Live page so the auth cookie is set.',
    })
  }
  throw cause
}
