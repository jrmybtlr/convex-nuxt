import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

/**
 * DevTools iframe — public Convex runtime config + debugging tips.
 * Live auth/connection: `window.__CONVEX_NUXT__` (devtools client plugin).
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const convex = (config.public?.convex ?? {}) as {
    url?: string
    server?: boolean
    auth?: {
      provider?: string
      cookie?: string
      httpOnly?: boolean
      presentCookie?: string
    }
  }

  const hasUrl = Boolean(convex.url)
  const summary = {
    url: convex.url ?? null,
    server: convex.server ?? true,
    auth: convex.auth
      ? {
          provider: convex.auth.provider ?? null,
          cookie: convex.auth.cookie ?? null,
          httpOnly: convex.auth.httpOnly ?? false,
          presentCookie: convex.auth.presentCookie ?? null,
        }
      : null,
  }

  const tips = [
    hasUrl ? 'Deployment URL is set.' : 'No URL — set convex.url or NUXT_PUBLIC_CONVEX_URL.',
    'In the app console: window.__CONVEX_NUXT__.connection (WebSocket).',
    'In the app console: window.__CONVEX_NUXT__.auth (gate flags).',
    'Gate private live queries with { authenticated: true }.',
    'SSR off globally: convex.server: false — or per call { server: false }.',
  ]

  const body = JSON.stringify({ config: summary, tips }, null, 2)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>use-convex · DevTools</title>
  <style>
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      margin: 1rem;
      color: #e5e7eb;
      background: #0b1220;
    }
    h1 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.35rem; color: #93c5fd; }
    p { margin: 0 0 0.75rem; font-size: 0.75rem; color: #9ca3af; }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.8rem;
      line-height: 1.45;
    }
  </style>
</head>
<body>
  <h1>use-convex</h1>
  <p>Nuxt DevTools · Convex module</p>
  <pre>${body.replace(/</g, '&lt;')}</pre>
</body>
</html>`
})
