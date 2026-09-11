import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

function asSubject(userId: string): string {
  return `${userId}|session-test`
}

describe('files', () => {
  it('rejects unauthenticated generateUploadUrl / list / save', async () => {
    const t = convexTest(schema, modules)
    await expect(t.mutation(api.files.generateUploadUrl, {})).rejects.toThrow(
      /Not authenticated/,
    )
    await expect(t.query(api.files.list, {})).rejects.toThrow(
      /Not authenticated/,
    )

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['x']))
    })
    await expect(
      t.mutation(api.files.save, {
        storageId,
        name: 'a.txt',
        contentType: 'text/plain',
        size: 1,
      }),
    ).rejects.toThrow(/Not authenticated/)
  })

  it('saves, lists, and removes owned files', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => ctx.db.insert('users', {}))
    const asUser = t.withIdentity({ subject: asSubject(userId) })

    const storageId = await t.run(async (ctx) => {
      const blob = new Blob(['hello files'], { type: 'text/plain' })
      return await ctx.storage.store(blob)
    })

    const fileId = await asUser.mutation(api.files.save, {
      storageId,
      name: 'hello.txt',
      contentType: 'text/plain',
      size: 11,
    })

    const listed = await asUser.query(api.files.list, {})
    expect(listed).toHaveLength(1)
    expect(listed[0]?._id).toBe(fileId)
    expect(listed[0]?.name).toBe('hello.txt')
    expect(listed[0]?.size).toBe(11)
    expect(listed[0]?.url).toBeTruthy()

    const uploadUrl = await asUser.mutation(api.files.generateUploadUrl, {})
    expect(typeof uploadUrl).toBe('string')
    expect(uploadUrl.length).toBeGreaterThan(0)

    await asUser.mutation(api.files.remove, { fileId })
    expect(await asUser.query(api.files.list, {})).toEqual([])
  })

  it('rejects removing another user\'s file', async () => {
    const t = convexTest(schema, modules)
    const ownerId = await t.run(async (ctx) => ctx.db.insert('users', {}))
    const otherId = await t.run(async (ctx) => ctx.db.insert('users', {}))

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['secret']))
    })

    const fileId = await t
      .withIdentity({ subject: asSubject(ownerId) })
      .mutation(api.files.save, {
        storageId,
        name: 'secret.bin',
        contentType: 'application/octet-stream',
        size: 6,
      })

    await expect(
      t
        .withIdentity({ subject: asSubject(otherId) })
        .mutation(api.files.remove, { fileId }),
    ).rejects.toThrow(/Unauthorized/)
  })

  it('rejects empty file names', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => ctx.db.insert('users', {}))
    const asUser = t.withIdentity({ subject: asSubject(userId) })
    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['x']))
    })
    await expect(
      asUser.mutation(api.files.save, {
        storageId,
        name: '   ',
        contentType: 'text/plain',
        size: 1,
      }),
    ).rejects.toThrow(/required/i)
  })
})
