import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

/**
 * Minimal DevTools iframe — shows public Convex runtime config.
 * Connection state is available in-app via `useConvexConnectionState()`.
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const convex = (config.public?.convex ?? {}) as {
    url?: string
    server?: boolean
    auth?: { provider?: string, cookie?: string, httpOnly?: boolean }
  }

  const body = JSON.stringify(
    {
      url: convex.url ?? null,
      server: convex.server ?? true,
      auth: convex.auth ?? null,
      tip: 'useConvexConnectionState() for live WebSocket status in the app',
    },
    null,
    2,
  )

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Convex · Nuxt DevTools</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin: 1rem; color: #e5e7eb; background: #0b1220; }
    h1 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.75rem; color: #93c5fd; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 0.8rem; line-height: 1.45; }
  </style>
</head>
<body>
  <h1>use-convex</h1>
  <pre>${body.replace(/</g, '&lt;')}</pre>
</body>
</html>`
})
