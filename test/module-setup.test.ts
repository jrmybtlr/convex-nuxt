import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadNuxt } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

function pluginSrcs(nuxt: Nuxt): string[] {
  return nuxt.options.plugins.map((p) => {
    if (typeof p === 'string') {
      return p
    }
    return typeof p === 'object' && p && 'src' in p ? String(p.src) : String(p)
  })
}

describe('module setup', () => {
  let nuxt: Nuxt | undefined

  afterEach(async () => {
    await nuxt?.close()
    nuxt = undefined
  })

  it('registers server + client plugins without auth provider', async () => {
    nuxt = await loadNuxt({
      cwd: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
      ready: true,
    })

    const plugins = pluginSrcs(nuxt)
    expect(plugins.some(p => p.includes('plugin.server'))).toBe(true)
    expect(plugins.some(p => p.includes('plugin.client'))).toBe(true)
    expect(plugins.some(p => p.includes('plugin.auth.client'))).toBe(false)

    const convex = nuxt.options.runtimeConfig.public.convex as {
      url?: string
      server?: boolean
      auth?: unknown
    }
    expect(convex.url).toBe('https://example.convex.cloud')
    expect(convex.server).toBe(true)
    expect(convex.auth).toBeUndefined()
  })

  it('registers auth plugin and defaults cookie when provider is convex-auth', async () => {
    nuxt = await loadNuxt({
      cwd: fileURLToPath(new URL('./fixtures/auth', import.meta.url)),
      ready: true,
    })

    const plugins = pluginSrcs(nuxt)
    expect(plugins.some(p => p.includes('plugin.server'))).toBe(true)
    expect(plugins.some(p => p.includes('plugin.client'))).toBe(true)
    expect(plugins.some(p => p.includes('plugin.auth.client'))).toBe(true)

    const convex = nuxt.options.runtimeConfig.public.convex as {
      auth?: { provider?: string, cookie?: string }
    }
    expect(convex.auth?.provider).toBe('convex-auth')
    expect(convex.auth?.cookie).toBe('convex_jwt')
  })
})
