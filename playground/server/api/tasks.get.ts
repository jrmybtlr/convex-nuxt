import { api } from '~~/convex/_generated/api'

/**
 * One-shot authenticated task list via Nitro + cookie JWT.
 * `requireConvexAuth` throws 401 when the auth cookie is missing.
 */
export default defineEventHandler(async (event) => {
  requireConvexAuth(event)
  try {
    return await fetchQuery(api.tasks.list, {}, { event })
  }
  catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    if (/auth|unauthor|not authenticated/i.test(message)) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Sign in on the Live page so the auth cookie is set.',
      })
    }
    throw cause
  }
})
