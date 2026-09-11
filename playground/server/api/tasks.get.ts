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
    rethrowConvexAuthError(cause)
  }
})
