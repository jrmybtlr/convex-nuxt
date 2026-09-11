import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { parseFixtureDump } from './utils/parseFixtureDump'

describe('fixture: auth', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/auth', import.meta.url)),
  })

  it('defaults cookie to convex_jwt and auto-imports auth helpers', async () => {
    const html = await $fetch<string>('/')
    const dump = parseFixtureDump(html) as {
      convex: {
        url?: string
        auth?: { provider?: string; cookie?: string }
      }
      hasConvex: boolean
      hasUseAuth: boolean
      hasSignIn: boolean
      hasSignOut: boolean
    }

    expect(dump.convex.auth?.provider).toBe('convex-auth')
    expect(dump.convex.auth?.cookie).toBe('convex_jwt')
    expect(dump.hasConvex).toBe(true)
    expect(dump.hasUseAuth).toBe(true)
    expect(dump.hasSignIn).toBe(true)
    expect(dump.hasSignOut).toBe(true)
  })
})
