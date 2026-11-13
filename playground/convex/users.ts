import { v } from 'convex/values'
import { internalMutation } from './_generated/server'

/** Convex Auth `createUser` callback: one app user per new identity. */
export const createUserPassword = internalMutation({
  args: {
    method: v.object({
      name: v.literal('usernamePassword'),
      profile: v.any(),
    }),
  },
  returns: v.id('users'),
  handler: async (ctx, { method }) => {
    const username = (method.profile as { username?: unknown } | null)?.username
    return await ctx.db.insert('users', typeof username === 'string' ? { name: username } : {})
  },
})
