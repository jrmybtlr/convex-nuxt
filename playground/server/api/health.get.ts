import { api } from '~~/convex/_generated/api'

/**
 * Public health check — no JWT required.
 * curl http://localhost:3000/api/health
 */
export default defineEventHandler(async (event) => {
  return await fetchQuery(api.health.status, {}, { event })
})
