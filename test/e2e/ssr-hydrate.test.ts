import { describe, expect, it } from 'vite-plus/test'

const enabled = process.env.E2E_CONVEX === '1'
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

describe.skipIf(!enabled)('ssr hydrate (live deployment)', () => {
  it('serves the Live page without crashing', async () => {
    const res = await fetch(baseURL + '/')
    expect(res.ok).toBe(true)
    const html = await res.text()
    expect(html).toMatch(/Convex \+ Nuxt SSR/)
  })

  it('exposes Nitro health without auth', async () => {
    const res = await fetch(baseURL + '/api/health')
    expect(res.ok).toBe(true)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('rejects unauthenticated tasks with 401', async () => {
    const res = await fetch(baseURL + '/api/tasks')
    expect(res.status).toBe(401)
  })
})
