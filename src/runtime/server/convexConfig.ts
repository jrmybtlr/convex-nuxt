import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

export interface ConvexPublicConfig {
  url?: string
  auth?: {
    provider?: string
    cookie?: string
    httpOnly?: boolean
    presentCookie?: string
  }
}

/** Read `runtimeConfig.public.convex`, or `undefined` outside a Nitro request. */
export function readConvexConfig(
  event?: H3Event,
): ConvexPublicConfig | undefined {
  try {
    const config = useRuntimeConfig(event)
    return config.public?.convex as ConvexPublicConfig | undefined
  }
  catch {
    return undefined
  }
}
