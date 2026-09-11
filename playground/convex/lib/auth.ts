import { getAuthUserId } from '@convex-dev/auth/server'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type AuthCtx = QueryCtx | MutationCtx

export async function getCurrentUserId(ctx: AuthCtx): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx)
  if (userId === null) {
    throw new Error('Not authenticated')
  }
  return userId
}

export async function requireTaskOwner(
  ctx: AuthCtx,
  taskId: Id<'tasks'>,
): Promise<Doc<'tasks'>> {
  const userId = await getCurrentUserId(ctx)
  const task = await ctx.db.get(taskId)
  if (!task) {
    throw new Error('Task not found')
  }
  if (task.userId !== userId) {
    throw new Error('Unauthorized: You do not own this task')
  }
  return task
}
