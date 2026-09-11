import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { parseFixtureDump } from './utils/parseFixtureDump'

describe('fixture: basic', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
  })

  it('merges runtimeConfig and provides $convex on SSR', async () => {
    const html = await $fetch<string>('/')
    const dump = parseFixtureDump(html) as {
      convex: { url?: string; server?: boolean; auth?: unknown }
      hasConvex: boolean
      url: string | null
      clientIsNull: boolean | null
    }

    expect(dump.convex.url).toBe('https://example.convex.cloud')
    expect(dump.convex.server).toBe(true)
    // Nuxt may coerce omitted auth to '' in serialized runtimeConfig.
    expect(
      dump.convex.auth && typeof dump.convex.auth === 'object'
        ? (dump.convex.auth as { provider?: string }).provider
        : undefined,
    ).toBeUndefined()
    expect(dump.hasConvex).toBe(true)
    expect(dump.url).toBe('https://example.convex.cloud')
    // SSR plugin sets client to null (no WebSocket on server).
    expect(dump.clientIsNull).toBe(true)
  })
})
