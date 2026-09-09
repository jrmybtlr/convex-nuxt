import { afterAll, describe, expect, it } from 'vitest'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import {
  authedConvexClient,
  clearHttpOnlySession,
  CookieJar,
  establishHttpOnlySession,
  fetchWithJar,
  resolveBaseURL,
  resolveConvexURL,
  signUpPassword,
  type AuthTokens,
} from './helpers'

const enabled = process.env.E2E_CONVEX === '1'

type Task = {
  _id: Id<'tasks'>
  text: string
  completed: boolean
}

describe.skipIf(!enabled)('playground full flow (live)', () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const taskPrefix = `e2e:${runId}:`
  const email = `e2e.${runId}@example.com`
  const password = 'e2e-test-password-1'
  const nitroTaskText = `${taskPrefix}nitro`

  const jar = new CookieJar()
  let tokens: AuthTokens | null = null
  let baseURL = ''
  let convexUrl = ''

  async function rollback(): Promise<void> {
    if (!tokens || !convexUrl) {
      return
    }
    const client = authedConvexClient(convexUrl, tokens.token)
    const listed = await client.query(api.tasks.list, {}) as Task[]
    const created = listed.filter(task => task.text.startsWith(taskPrefix))
    for (const task of created) {
      await client.mutation(api.tasks.remove, { taskId: task._id })
    }
    const after = await client.query(api.tasks.list, {}) as Task[]
    expect(after.some(task => task.text.startsWith(taskPrefix))).toBe(false)

    if (baseURL) {
      await clearHttpOnlySession(baseURL, jar)
    }
    tokens = null
  }

  afterAll(async () => {
    await rollback()
  })

  it('signs up, exercises Nitro + Convex, then rolls back tasks', async () => {
    baseURL = resolveBaseURL()
    convexUrl = resolveConvexURL()

    const healthRes = await fetch(`${baseURL}/api/health`)
    expect(healthRes.ok).toBe(true)
    expect(await healthRes.json()).toEqual({ ok: true })

    const unauthRes = await fetch(`${baseURL}/api/tasks`)
    expect(unauthRes.status).toBe(401)

    tokens = await signUpPassword(convexUrl, email, password)
    await establishHttpOnlySession(baseURL, jar, tokens)

    try {
      const createRes = await fetchWithJar(baseURL, jar, '/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ text: nitroTaskText }),
      })
      expect(createRes.ok).toBe(true)
      const createdBody = await createRes.json() as { taskId: string }
      expect(createdBody.taskId).toBeTruthy()

      const listRes = await fetchWithJar(baseURL, jar, '/api/tasks')
      expect(listRes.ok).toBe(true)
      const nitroListed = await listRes.json() as Task[]
      const nitroTask = nitroListed.find(task => task.text === nitroTaskText)
      expect(nitroTask).toBeDefined()
      expect(nitroTask!.completed).toBe(false)

      const client = authedConvexClient(convexUrl, tokens.token)
      await client.mutation(api.tasks.toggle, { taskId: nitroTask!._id })
      const afterToggle = await client.query(api.tasks.list, {}) as Task[]
      expect(
        afterToggle.find(task => task._id === nitroTask!._id)?.completed,
      ).toBe(true)

      const htmlRes = await fetchWithJar(baseURL, jar, '/')
      expect(htmlRes.ok).toBe(true)
      const html = await htmlRes.text()
      expect(html).toContain(nitroTaskText)
      expect(html).toMatch(/Convex \+ Nuxt SSR/)

      const shoutRes = await fetchWithJar(baseURL, jar, '/api/shout', {
        method: 'POST',
        body: JSON.stringify({ text: 'e2e' }),
      })
      expect(shoutRes.ok).toBe(true)
      expect(await shoutRes.json()).toEqual({ shouted: 'E2E' })
    }
    finally {
      await rollback()
    }
  })
})
