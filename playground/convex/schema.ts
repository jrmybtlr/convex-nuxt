import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { authTables } from '@convex-dev/auth/server'

export default defineSchema({
  ...authTables,
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
