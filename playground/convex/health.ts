import { v } from 'convex/values'
import { query } from './_generated/server'

/**
 * Public health check — no auth. Used by Nitro `/api/health` for a curl-able demo.
 */
export const status = query({
  args: {},
  returns: v.object({
    ok: v.literal(true),
  }),
  handler: async () => {
    return { ok: true as const }
  },
})
