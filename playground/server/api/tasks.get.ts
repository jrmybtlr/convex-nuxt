import { api } from '~~/convex/_generated/api'

/**
 * One-shot authenticated task list via Nitro + cookie JWT.
 * Pass `{ event }` so fetchQuery reads `convex.auth.cookie`.
 */
export default defineEventHandler(async (event) => {
  try {
    return await fetchQuery(api.tasks.list, {}, { event })
  }
  catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    if (/auth|unauthor|not authenticated/i.test(message)) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Sign in on the Live page so the convex_jwt cookie is set.',
      })
    }
    throw cause
  }
})
