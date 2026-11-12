import { convexTest } from 'convex-test'
import { describe, expect, it, vi } from 'vite-plus/test'
import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

// Convex Auth v2 resolves the user through its `auth` component session.
// These tests cover ownership rules, so map the identity subject straight
// to the app user id instead of minting real sessions.
vi.mock('@convex-dev/auth/server', () => ({
  getAuthUserId: async (ctx: {
    auth: { getUserIdentity: () => Promise<{ subject: string } | null> }
  }) => (await ctx.auth.getUserIdentity())?.subject ?? null,
}))

function asSubject(userId: string): string {
  return userId
}

describe('tasks', () => {
  it('rejects unauthenticated list', async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.tasks.list, {})).rejects.toThrow(/Not authenticated/)
  })

  it('creates, lists, toggles, and removes owned tasks', async () => {
    const t = convexTest(schema, modules)

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {})
    })

    const asUser = t.withIdentity({ subject: asSubject(userId) })

    const taskId = await asUser.mutation(api.tasks.create, {
      text: 'Ship auth demo',
    })

    const listed = await asUser.query(api.tasks.list, {})
    expect(listed).toHaveLength(1)
    expect(listed[0]?._id).toBe(taskId)
    expect(listed[0]?.text).toBe('Ship auth demo')
    expect(listed[0]?.completed).toBe(false)

    await asUser.mutation(api.tasks.toggle, { taskId })
    const afterToggle = await asUser.query(api.tasks.list, {})
    expect(afterToggle[0]?.completed).toBe(true)

    await asUser.mutation(api.tasks.remove, { taskId })
    expect(await asUser.query(api.tasks.list, {})).toEqual([])
  })

  it('rejects empty task text', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => ctx.db.insert('users', {}))
    const asUser = t.withIdentity({ subject: asSubject(userId) })
    await expect(asUser.mutation(api.tasks.create, { text: '   ' })).rejects.toThrow(/required/i)
  })

  it("rejects mutating another user's task", async () => {
    const t = convexTest(schema, modules)
    const ownerId = await t.run(async (ctx) => ctx.db.insert('users', {}))
    const otherId = await t.run(async (ctx) => ctx.db.insert('users', {}))

    const taskId = await t
      .withIdentity({ subject: asSubject(ownerId) })
      .mutation(api.tasks.create, { text: 'private' })

    await expect(
      t.withIdentity({ subject: asSubject(otherId) }).mutation(api.tasks.toggle, { taskId }),
    ).rejects.toThrow(/Unauthorized/)
  })

  it('shout requires auth and uppercases text', async () => {
    const t = convexTest(schema, modules)
    await expect(t.action(api.tasks.shout, { text: 'hi' })).rejects.toThrow(/Not authenticated/)

    const userId = await t.run(async (ctx) => ctx.db.insert('users', {}))
    const asUser = t.withIdentity({ subject: asSubject(userId) })
    await expect(asUser.action(api.tasks.shout, { text: ' hi ' })).resolves.toBe('HI')
  })
})
