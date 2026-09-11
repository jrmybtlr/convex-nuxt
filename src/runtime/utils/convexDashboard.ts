/**
 * Helpers for linking / embedding the Convex dashboard from Nuxt DevTools.
 * Pure — no Nitro / Nuxt imports so unit tests stay lightweight.
 */

export const DASHBOARD_EMBED_ORIGIN = 'https://dashboard-embedded.convex.dev'
export const DASHBOARD_EMBED_DATA_URL = `${DASHBOARD_EMBED_ORIGIN}/data`
export const DASHBOARD_HOST = 'https://dashboard.convex.dev'

/**
 * Strip CLI prefixes like `dev:happy-animal-123` → `happy-animal-123`.
 */
export function deploymentNameFromEnv(value: string | undefined | null): string | null {
  if (!value) return null
  // Allow raw env lines with trailing `# comment` if dotenv did not strip them.
  const trimmed = value.split('#')[0]?.trim() ?? ''
  if (!trimmed) return null
  const colon = trimmed.indexOf(':')
  if (colon >= 0 && colon < trimmed.length - 1) {
    return trimmed.slice(colon + 1)
  }
  return trimmed
}

/**
 * Derive deployment name from a cloud URL host: `happy-animal-123.convex.cloud`.
 */
export function deploymentNameFromUrl(url: string | undefined | null): string | null {
  if (!url) return null
  try {
    const { hostname } = new URL(url)
    if (hostname.endsWith('.convex.cloud')) {
      const name = hostname.slice(0, -'.convex.cloud'.length)
      return name || null
    }
    return null
  } catch {
    return null
  }
}

export function resolveDeploymentName(options: {
  url?: string | null
  convexDeployment?: string | null
}): string | null {
  return (
    deploymentNameFromUrl(options.url) ?? deploymentNameFromEnv(options.convexDeployment) ?? null
  )
}

/** True when the URL looks like Convex Cloud (embeddable hosted dashboard). */
export function isConvexCloudUrl(url: string | undefined | null): boolean {
  if (!url) return false
  try {
    const { hostname } = new URL(url)
    return hostname.endsWith('.convex.cloud')
  } catch {
    return false
  }
}

/** True for a loopback Convex backend (`npx convex dev --local`). */
export function isLocalConvexUrl(url: string | undefined | null): boolean {
  if (!url) return false
  try {
    const { hostname } = new URL(url)
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
  } catch {
    return false
  }
}

/**
 * When CONVEX_DEPLOYMENT is a cloud `dev:`/`prod:` name but the app URL is
 * still loopback (CLI: "Can't safely modify .env.local"), return the cloud URL.
 */
export function suggestedCloudUrlFromMismatch(
  url: string | undefined | null,
  convexDeployment: string | undefined | null,
): string | null {
  if (!isLocalConvexUrl(url)) return null
  const trimmed = convexDeployment?.split('#')[0]?.trim() ?? ''
  if (!/^(dev|prod):/.test(trimmed)) return null
  const name = deploymentNameFromEnv(trimmed)
  if (!name) return null
  return `https://${name}.convex.cloud`
}

export function dashboardDeepLink(deploymentName: string | null): string | null {
  if (!deploymentName) return null
  return `${DASHBOARD_HOST}/d/${encodeURIComponent(deploymentName)}`
}

export interface DevtoolsDashboardPayload {
  deploymentUrl: string | null
  deploymentName: string | null
  /** Present only when CONVEX_DEPLOY_KEY is set (dev server only). */
  adminKey: string | null
  embed: boolean
  openDashboardUrl: string | null
  embedSrc: string
  embedOrigin: string
}

export function buildDevtoolsDashboardPayload(options: {
  url?: string | null
  convexDeployment?: string | null
  deployKey?: string | null
}): DevtoolsDashboardPayload {
  const deploymentUrl = options.url?.trim() || null
  const deploymentName = resolveDeploymentName({
    url: deploymentUrl,
    convexDeployment: options.convexDeployment,
  })
  const adminKey = options.deployKey?.trim() || null
  const embed = isConvexCloudUrl(deploymentUrl)

  return {
    deploymentUrl,
    deploymentName,
    adminKey: embed && adminKey ? adminKey : null,
    embed,
    openDashboardUrl: dashboardDeepLink(deploymentName),
    embedSrc: DASHBOARD_EMBED_DATA_URL,
    embedOrigin: DASHBOARD_EMBED_ORIGIN,
  }
}
