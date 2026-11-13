import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import type { ConvexAuthConfig } from '../utils/authStorage'

export interface ConvexPublicConfig {
  url?: string
  auth?: ConvexAuthConfig
}

/** Read `runtimeConfig.public.convex`, or `undefined` outside a Nitro request. */
export function readConvexConfig(event?: H3Event): ConvexPublicConfig | undefined {
  try {
    const config = useRuntimeConfig(event)
    return config.public?.convex as ConvexPublicConfig | undefined
  } catch {
    return undefined
  }
}
