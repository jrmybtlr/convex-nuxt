import { api } from '~~/convex/_generated/api'

/**
 * One-shot create via Nitro `fetchMutation`.
 * Same cookie auth as GET /api/tasks.
 */
export default defineEventHandler(async (event) => {
  requireConvexAuth(event)
  const body = await readBody<{ text?: string }>(event)
  const text = body?.text?.trim()
  if (!text) {
    throw createError({
      statusCode: 400,
      statusMessage: 'text is required',
    })
  }

  try {
    const taskId = await fetchMutation(api.tasks.create, { text }, { event })
    return { taskId }
  } catch (cause) {
    rethrowConvexAuthError(cause)
  }
})
