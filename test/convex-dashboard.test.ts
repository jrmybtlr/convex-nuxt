import { describe, expect, it } from 'vite-plus/test'
import {
  DASHBOARD_EMBED_DATA_URL,
  DASHBOARD_EMBED_ORIGIN,
  buildDevtoolsDashboardPayload,
  dashboardDeepLink,
  deploymentNameFromEnv,
  deploymentNameFromUrl,
  isConvexCloudUrl,
  isLocalConvexUrl,
  resolveDeploymentName,
  suggestedCloudUrlFromMismatch,
} from '../src/runtime/utils/convexDashboard'

describe('convexDashboard helpers', () => {
  it('parses deployment name from *.convex.cloud URL', () => {
    expect(deploymentNameFromUrl('https://happy-animal-123.convex.cloud')).toBe('happy-animal-123')
    expect(deploymentNameFromUrl('https://happy-animal-123.convex.cloud/')).toBe('happy-animal-123')
    expect(deploymentNameFromUrl('https://example.com')).toBeNull()
    expect(deploymentNameFromUrl('not-a-url')).toBeNull()
    expect(deploymentNameFromUrl(null)).toBeNull()
  })

  it('strips CONVEX_DEPLOYMENT prefixes', () => {
    expect(deploymentNameFromEnv('dev:happy-animal-123')).toBe('happy-animal-123')
    expect(deploymentNameFromEnv('prod:happy-animal-123')).toBe('happy-animal-123')
    expect(deploymentNameFromEnv('happy-animal-123')).toBe('happy-animal-123')
    expect(deploymentNameFromEnv('local:local-name # team: foo')).toBe('local-name')
    expect(deploymentNameFromEnv('  ')).toBeNull()
    expect(deploymentNameFromEnv(undefined)).toBeNull()
  })

  it('prefers URL name over CONVEX_DEPLOYMENT', () => {
    expect(
      resolveDeploymentName({
        url: 'https://from-url.convex.cloud',
        convexDeployment: 'dev:from-env',
      }),
    ).toBe('from-url')
    expect(
      resolveDeploymentName({
        url: 'http://127.0.0.1:3210',
        convexDeployment: 'dev:from-env',
      }),
    ).toBe('from-env')
  })

  it('detects Convex Cloud vs local URLs', () => {
    expect(isConvexCloudUrl('https://happy-animal-123.convex.cloud')).toBe(true)
    expect(isConvexCloudUrl('http://127.0.0.1:3210')).toBe(false)
    expect(isConvexCloudUrl('http://localhost:3210')).toBe(false)
    expect(isConvexCloudUrl(undefined)).toBe(false)
    expect(isLocalConvexUrl('http://127.0.0.1:3210')).toBe(true)
    expect(isLocalConvexUrl('http://localhost:3210')).toBe(true)
    expect(isLocalConvexUrl('https://happy-animal-123.convex.cloud')).toBe(false)
  })

  it('suggests the cloud URL when .env.local still points at loopback', () => {
    expect(suggestedCloudUrlFromMismatch('http://127.0.0.1:3210', 'dev:clear-terrier-531')).toBe(
      'https://clear-terrier-531.convex.cloud',
    )
    expect(
      suggestedCloudUrlFromMismatch(
        'http://127.0.0.1:3210',
        'local:local-jeremy_butler-playground',
      ),
    ).toBeNull()
    expect(
      suggestedCloudUrlFromMismatch(
        'https://clear-terrier-531.convex.cloud',
        'dev:clear-terrier-531',
      ),
    ).toBeNull()
  })

  it('detects loopback Convex URLs', () => {
    expect(isLocalConvexUrl('http://127.0.0.1:3210')).toBe(true)
    expect(isLocalConvexUrl('http://localhost:3210')).toBe(true)
    expect(isLocalConvexUrl('http://[::1]:3210')).toBe(true)
    expect(isLocalConvexUrl('https://happy-animal-123.convex.cloud')).toBe(false)
  })

  it('suggests the cloud URL when .env.local still points at loopback', () => {
    expect(
      suggestedCloudUrlFromMismatch('http://127.0.0.1:3210', 'dev:clear-terrier-531'),
    ).toBe('https://clear-terrier-531.convex.cloud')
    expect(
      suggestedCloudUrlFromMismatch('http://127.0.0.1:3210', 'local:local-jeremy_butler-playground'),
    ).toBeNull()
    expect(
      suggestedCloudUrlFromMismatch('https://clear-terrier-531.convex.cloud', 'dev:clear-terrier-531'),
    ).toBeNull()
  })

  it('builds dashboard deep links', () => {
    expect(dashboardDeepLink('happy-animal-123')).toBe(
      'https://dashboard.convex.dev/d/happy-animal-123',
    )
    expect(dashboardDeepLink(null)).toBeNull()
  })

  it('builds embed payload with optional deploy key', () => {
    const withKey = buildDevtoolsDashboardPayload({
      url: 'https://happy-animal-123.convex.cloud',
      convexDeployment: 'dev:ignored',
      deployKey: ' deploy:key ',
    })
    expect(withKey).toMatchObject({
      deploymentUrl: 'https://happy-animal-123.convex.cloud',
      deploymentName: 'happy-animal-123',
      adminKey: 'deploy:key',
      embed: true,
      openDashboardUrl: 'https://dashboard.convex.dev/d/happy-animal-123',
      embedSrc: DASHBOARD_EMBED_DATA_URL,
      embedOrigin: DASHBOARD_EMBED_ORIGIN,
    })

    const noKey = buildDevtoolsDashboardPayload({
      url: 'https://happy-animal-123.convex.cloud',
    })
    expect(noKey.adminKey).toBeNull()
    expect(noKey.embed).toBe(true)

    const local = buildDevtoolsDashboardPayload({
      url: 'http://127.0.0.1:3210',
      convexDeployment: 'dev:local-name',
      deployKey: 'secret',
    })
    expect(local.embed).toBe(false)
    expect(local.adminKey).toBeNull()
    expect(local.openDashboardUrl).toBe('https://dashboard.convex.dev/d/local-name')
  })
})
