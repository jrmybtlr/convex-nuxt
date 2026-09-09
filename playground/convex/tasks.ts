import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { action, mutation, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { getCurrentUserId, requireTaskOwner } from './lib/auth'

const taskValidator = v.object({
  _id: v.id('tasks'),
  _creationTime: v.number(),
  userId: v.id('users'),
  text: v.string(),
  completed: v.boolean(),
})

async function listTasksForUser(
  ctx: QueryCtx,
  userId: Id<'users'>,
): Promise<Array<Doc<'tasks'>>> {
  return await ctx.db
    .query('tasks')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .order('desc')
    .collect()
}

async function createTaskForUser(
  ctx: MutationCtx,
  userId: Id<'users'>,
  text: string,
): Promise<Id<'tasks'>> {
  return await ctx.db.insert('tasks', {
    userId,
    text,
    completed: false,
  })
}

export const list = query({
  args: {},
  returns: v.array(taskValidator),
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx)
    return await listTasksForUser(ctx, userId)
  },
})

export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(taskValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx)
    return await ctx.db
      .query('tasks')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

export const create = mutation({
  args: {
    text: v.string(),
  },
  returns: v.id('tasks'),
  handler: async (ctx, args) => {
    const text = args.text.trim()
    if (!text) {
      throw new Error('Task text is required')
    }
    const userId = await getCurrentUserId(ctx)
    return await createTaskForUser(ctx, userId, text)
  },
})

export const toggle = mutation({
  args: {
    taskId: v.id('tasks'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await requireTaskOwner(ctx, args.taskId)
    await ctx.db.patch(args.taskId, { completed: !task.completed })
    return null
  },
})

export const remove = mutation({
  args: {
    taskId: v.id('tasks'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTaskOwner(ctx, args.taskId)
    await ctx.db.delete(args.taskId)
    return null
  },
})

/**
 * Demo action for playground `useConvexAction` / `fetchAction`.
 */
export const shout = action({
  args: { text: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => {
    const text = args.text.trim()
    if (!text) {
      throw new Error('text is required')
    }
    return text.toUpperCase()
  },
})
