import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
import { $fetch, fetch, setup, url } from '@nuxt/test-utils/e2e'
import { parseFixtureDump } from './utils/parseFixtureDump'

describe('fixture: auth (Convex Auth v2, SSR mode)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/auth', import.meta.url)),
  })

  it('auto-imports the v2 auth composables and keeps server options private', async () => {
    const html = await $fetch<string>('/')
    const dump = parseFixtureDump(html) as {
      convex: { auth?: Record<string, unknown> }
      hasConvex: boolean
      hasUseAuth: boolean
      hasUseConvexSignIn: boolean
      hasUseOAuthSignIn: boolean
      hasUseOAuth: boolean
      hasSignOut: boolean
    }

    expect(dump.convex.auth?.provider).toBe('convex-auth')
    // The sign-in allowlist is server-only runtime config.
    expect(dump.convex.auth).not.toHaveProperty('signIn')
    expect(dump.hasConvex).toBe(true)
    expect(dump.hasUseAuth).toBe(true)
    expect(dump.hasUseConvexSignIn).toBe(true)
    expect(dump.hasUseOAuthSignIn).toBe(true)
    expect(dump.hasUseOAuth).toBe(true)
    expect(dump.hasSignOut).toBe(true)
  })

  const sameOrigin = () => ({
    'content-type': 'application/json',
    origin: new URL(url('/')).origin,
  })

  it('refresh route reports no session without a refresh cookie', async () => {
    const res = await fetch('/api/convex/auth/refresh', {
      method: 'POST',
      headers: sameOrigin(),
      body: '{}',
    })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ tokens: null })
  })

  it('sign-out route clears both auth cookies', async () => {
    const res = await fetch('/api/convex/auth/signout', {
      method: 'POST',
      headers: sameOrigin(),
      body: '{}',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tokens: null })
    const cookies = res.headers.getSetCookie().join('\n')
    expect(cookies).toContain('__convexAuthJWT=;')
    expect(cookies).toContain('__convexAuthRefreshToken=;')
  })

  it('auth proxy refuses functions outside the signIn allowlist', async () => {
    const res = await fetch('/api/convex/auth/signin?path=/api/mutation', {
      method: 'POST',
      headers: sameOrigin(),
      body: JSON.stringify({
        path: 'tasks:deleteEverything',
        format: 'convex_encoded_json',
        args: [{}],
      }),
    })
    expect(res.status).toBe(403)
    expect(await res.text()).toContain('not exposed through the auth proxy')
  })

  it('auth routes refuse cross-site requests', async () => {
    const res = await fetch('/api/convex/auth/signout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: '{}',
    })
    expect(res.status).toBe(403)
  })

  it('renders signed out when the access cookie is expired and there is no refresh cookie', async () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const expired = `${encode({ alg: 'none' })}.${encode({ exp: 1 })}.sig`
    const res = await fetch('/', { headers: { cookie: `__convexAuthJWT=${expired}` } })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).not.toContain(expired)
  })
})
