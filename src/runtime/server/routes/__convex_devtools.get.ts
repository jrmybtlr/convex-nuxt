import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { buildDevtoolsDashboardPayload } from '../../utils/convexDashboard'

/**
 * DevTools iframe — embeds Convex dashboard (cloud) + public config tips.
 * Live auth/connection: `window.__CONVEX_NUXT__` (devtools client plugin).
 *
 * Auto-login uses CONVEX_DEPLOY_KEY via postMessage to dashboard-embedded.
 * Without a key, the embed shows Convex's credential form; Open dashboard
 * still deep-links to dashboard.convex.dev (existing session).
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
  const devtools = (
    config as {
      convexDevtools?: { deployKey?: string; deployment?: string; url?: string }
    }
  ).convexDevtools

  const url =
    (typeof convex.url === 'string' && convex.url.trim()) ||
    (typeof devtools?.url === 'string' && devtools.url.trim()) ||
    process.env.NUXT_PUBLIC_CONVEX_URL?.trim() ||
    process.env.CONVEX_URL?.trim() ||
    null

  const hasUrl = Boolean(url)
  const summary = {
    url,
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
    'Set CONVEX_DEPLOY_KEY for dashboard auto-login in this tab (dev only).',
    'In the app console: window.__CONVEX_NUXT__.connection (WebSocket).',
    'In the app console: window.__CONVEX_NUXT__.auth (gate flags).',
    'Gate private live queries with { authenticated: true }.',
    'SSR off globally: convex.server: false — or per call { server: false }.',
  ]

  const dashboard = buildDevtoolsDashboardPayload({
    url,
    convexDeployment: devtools?.deployment || process.env.CONVEX_DEPLOYMENT,
    deployKey: devtools?.deployKey || process.env.CONVEX_DEPLOY_KEY,
  })

  // Escape for embedding in <script> / HTML text (avoid </script> breakouts).
  const configJson = JSON.stringify({ config: summary, tips }).replace(/</g, '\\u003c')
  const dashboardJson = JSON.stringify({
    deploymentUrl: dashboard.deploymentUrl,
    deploymentName: dashboard.deploymentName,
    adminKey: dashboard.adminKey,
    embed: dashboard.embed,
    embedSrc: dashboard.embedSrc,
    embedOrigin: dashboard.embedOrigin,
  }).replace(/</g, '\\u003c')

  const openHref = dashboard.openDashboardUrl ? escapeHtml(dashboard.openDashboardUrl) : null
  const urlLabel = dashboard.deploymentUrl
    ? escapeHtml(dashboard.deploymentUrl)
    : 'No deployment URL'
  const statusLabel = !dashboard.embed
    ? 'Hosted embed needs a *.convex.cloud URL'
    : dashboard.adminKey
      ? 'Auto-login via CONVEX_DEPLOY_KEY'
      : 'Paste credentials in the embed, or Open dashboard'

  const embedBlock = dashboard.embed
    ? `<div id="embed-wrap" class="embed${dashboard.adminKey ? ' pending' : ''}">
  <iframe
    id="convex-dashboard"
    title="Convex dashboard"
    src="${escapeHtml(dashboard.embedSrc)}"
    allow="clipboard-write"
  ></iframe>
</div>`
    : `<div class="notice">
  <p>The hosted Convex dashboard embed only works with Convex Cloud URLs (<code>*.convex.cloud</code>).</p>
  <p>Local / self-hosted deployments: use the CLI dashboard or Open dashboard when a name is known.</p>
</div>`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>use-convex · DevTools</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
      margin: 0;
    }
    body {
      display: flex;
      flex-direction: column;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #e5e7eb;
      background: #0b1220;
    }
    header {
      flex: 0 0 auto;
      padding: 0.65rem 0.85rem;
      border-bottom: 1px solid #1f2937;
      background: #0f172a;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.5rem 0.85rem;
    }
    h1 {
      font-size: 0.9rem;
      font-weight: 600;
      margin: 0;
      color: #93c5fd;
    }
    .url {
      font-size: 0.7rem;
      color: #9ca3af;
      word-break: break-all;
    }
    .status {
      font-size: 0.7rem;
      color: #a5b4fc;
    }
    a.open {
      font-size: 0.75rem;
      color: #67e8f9;
      text-decoration: none;
    }
    a.open:hover { text-decoration: underline; }
    details {
      margin-top: 0.45rem;
    }
    summary {
      cursor: pointer;
      font-size: 0.7rem;
      color: #9ca3af;
      user-select: none;
    }
    pre {
      margin: 0.4rem 0 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.72rem;
      line-height: 1.4;
      max-height: 12rem;
      overflow: auto;
    }
    .embed {
      flex: 1 1 auto;
      min-height: 0;
      position: relative;
    }
    .embed.pending iframe { visibility: hidden; }
    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: #111827;
    }
    .notice {
      flex: 1 1 auto;
      padding: 1rem 0.85rem;
      font-size: 0.8rem;
      color: #9ca3af;
      line-height: 1.5;
    }
    .notice code { color: #93c5fd; }
  </style>
</head>
<body>
  <header>
    <div class="row">
      <h1>use-convex</h1>
      <span class="url">${urlLabel}</span>
      ${openHref ? `<a class="open" href="${openHref}" target="_blank" rel="noopener noreferrer">Open dashboard ↗</a>` : ''}
    </div>
    <p class="status">${escapeHtml(statusLabel)}</p>
    <details>
      <summary>Module config &amp; tips</summary>
      <pre id="config-pre"></pre>
    </details>
  </header>
  ${embedBlock}
  <script>
    (function () {
      var config = ${configJson};
      var dash = ${dashboardJson};
      var pre = document.getElementById('config-pre');
      if (pre) pre.textContent = JSON.stringify(config, null, 2);

      if (!dash.embed || !dash.adminKey) return;

      var iframe = document.getElementById('convex-dashboard');
      var wrap = document.getElementById('embed-wrap');
      if (!iframe || !iframe.contentWindow) return;

      function reveal() {
        if (wrap) wrap.classList.remove('pending');
      }

      window.addEventListener('message', function (event) {
        if (event.origin !== dash.embedOrigin) return;
        if (!event.data || event.data.type !== 'dashboard-credentials-request') return;
        iframe.contentWindow.postMessage(
          {
            type: 'dashboard-credentials',
            adminKey: dash.adminKey,
            deploymentUrl: dash.deploymentUrl,
            deploymentName: dash.deploymentName,
          },
          dash.embedOrigin,
        );
        reveal();
      });
    })();
  </script>
</body>
</html>`
})

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
