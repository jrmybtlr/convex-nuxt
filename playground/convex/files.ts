import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { getCurrentUserId } from './lib/auth'

const DEMO_FILE_LIST_LIMIT = 50

const fileListItemValidator = v.object({
  _id: v.id('files'),
  _creationTime: v.number(),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
  url: v.union(v.string(), v.null()),
})

/**
 * Short-lived upload URL for Convex storage.
 * Auth required — never expose this without a signed-in user.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await getCurrentUserId(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Persist metadata after the client POSTs the file bytes to the upload URL.
 */
export const save = mutation({
  args: {
    storageId: v.id('_storage'),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.id('files'),
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx)
    if (!args.name.trim()) {
      throw new Error('File name is required')
    }
    if (args.size < 0) {
      throw new Error('Invalid file size')
    }
    return await ctx.db.insert('files', {
      userId,
      storageId: args.storageId,
      name: args.name.trim(),
      contentType: args.contentType || 'application/octet-stream',
      size: args.size,
    })
  },
})

export const list = query({
  args: {},
  returns: v.array(fileListItemValidator),
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx)
    const files = await ctx.db
      .query('files')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .take(DEMO_FILE_LIST_LIMIT)

    return await Promise.all(
      files.map(async (file) => ({
        _id: file._id,
        _creationTime: file._creationTime,
        name: file.name,
        contentType: file.contentType,
        size: file.size,
        url: await ctx.storage.getUrl(file.storageId),
      })),
    )
  },
})

export const remove = mutation({
  args: {
    fileId: v.id('files'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx)
    const file = await ctx.db.get(args.fileId)
    if (!file) {
      throw new Error('File not found')
    }
    if (file.userId !== userId) {
      throw new Error('Unauthorized: You do not own this file')
    }
    const storageId: Id<'_storage'> = file.storageId
    await ctx.db.delete(args.fileId)
    await ctx.storage.delete(storageId)
    return null
  },
})
