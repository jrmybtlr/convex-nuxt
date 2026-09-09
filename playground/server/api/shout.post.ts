import { api } from '~~/convex/_generated/api'

/**
 * Demo `fetchAction` — uppercases text (no auth required).
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
  const shouted = await fetchAction(api.tasks.shout, { text }, { event })
  return { shouted }
})
