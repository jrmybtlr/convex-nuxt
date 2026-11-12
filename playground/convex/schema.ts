import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  // App-owned users table; Convex Auth v2 keeps its own data in components.
  users: defineTable({
    name: v.optional(v.string()),
  }),
  tasks: defineTable({
    userId: v.id('users'),
    text: v.string(),
    completed: v.boolean(),
  }).index('by_user', ['userId']),
  files: defineTable({
    userId: v.id('users'),
    storageId: v.id('_storage'),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  }).index('by_user', ['userId']),
})
