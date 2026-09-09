import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { parseFixtureDump } from './utils/parseFixtureDump'

describe('fixture: empty-url', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/empty-url', import.meta.url)),
  })

  it('renders without $convex when URL is missing', async () => {
    const html = await $fetch<string>('/')
    const dump = parseFixtureDump(html) as {
      hasConvex: boolean
      ok: boolean
    }

    expect(dump.ok).toBe(true)
    expect(dump.hasConvex).toBe(false)
  })
})
