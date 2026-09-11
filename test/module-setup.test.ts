import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vite-plus/test'
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

function serverHandlerRoutes(nuxt: Nuxt): string[] {
  const handlers = (
    nuxt.options as Nuxt['options'] & {
      serverHandlers?: Array<{ route?: string } | string>
    }
  ).serverHandlers
  return (handlers ?? [])
    .map((h) => (h && typeof h === 'object' && 'route' in h ? String(h.route) : ''))
    .filter(Boolean)
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
    expect(plugins.some((p) => p.includes('plugin.server'))).toBe(true)
    expect(plugins.some((p) => p.includes('plugin.client'))).toBe(true)
    expect(plugins.some((p) => p.includes('plugin.auth.client'))).toBe(false)

    const convex = nuxt.options.runtimeConfig.public.convex as {
      url?: string
      server?: boolean
      auth?: unknown
    }
    expect(convex.url).toBe('https://example.convex.cloud')
    expect(convex.server).toBe(true)
    expect(convex.auth).toBeUndefined()

    const routes = serverHandlerRoutes(nuxt)
    expect(routes).toContain('/api/convex/auth/session')
  })

  it('registers auth plugin and defaults cookie when provider is convex-auth', async () => {
    nuxt = await loadNuxt({
      cwd: fileURLToPath(new URL('./fixtures/auth', import.meta.url)),
      ready: true,
    })

    const plugins = pluginSrcs(nuxt)
    expect(plugins.some((p) => p.includes('plugin.server'))).toBe(true)
    expect(plugins.some((p) => p.includes('plugin.client'))).toBe(true)
    expect(plugins.some((p) => p.includes('plugin.auth.client'))).toBe(true)

    const convex = nuxt.options.runtimeConfig.public.convex as {
      auth?: { provider?: string; cookie?: string }
    }
    expect(convex.auth?.provider).toBe('convex-auth')
    expect(convex.auth?.cookie).toBe('convex_jwt')
  })

  it('keeps AuthRefreshing, upload helpers, and DevTools wired in the module', async () => {
    // Nuxt does not expose addImports/addComponent results on options after
    // loadNuxt({ ready: true }); assert module wiring stays intact.
    const moduleSrc = await readFile(
      fileURLToPath(new URL('../src/module.ts', import.meta.url)),
      'utf8',
    )
    for (const token of [
      'AuthRefreshing',
      'useConvexFileUpload',
      'useConvexR2Upload',
      'useConvexQueries',
      'prewarmQuery',
      'requireConvexAuthMiddleware',
      '__convex_devtools',
    ]) {
      expect(moduleSrc).toContain(token)
    }
  })
})
