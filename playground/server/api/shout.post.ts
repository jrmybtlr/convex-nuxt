import { api } from '~~/convex/_generated/api'

/**
 * Demo `fetchAction` — uppercases text (requires Convex auth cookie).
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
    const shouted = await fetchAction(api.tasks.shout, { text }, { event })
    return { shouted }
  }
  catch (cause) {
    rethrowConvexAuthError(cause)
  }
})
