import { api } from '~~/convex/_generated/api'

export default defineEventHandler(async (event) => {
  return await fetchQuery(api.health.status, {}, { event })
})
