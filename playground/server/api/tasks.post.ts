import { api } from '~~/convex/_generated/api'

/**
 * One-shot create via Nitro `fetchMutation`.
 * Same cookie auth as GET /api/tasks.
 *
 * `fetchAction` works the same way when you have an action to call:
 * `await fetchAction(api.myAction, args, { event })`
 */
export default defineEventHandler(async (event) => {
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
  }
  catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    if (/auth|unauthor|not authenticated/i.test(message)) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Sign in on the Live page so the convex_jwt cookie is set.',
      })
    }
    throw cause
  }
})
