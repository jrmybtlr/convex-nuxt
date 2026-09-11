import { describe, expect, it } from 'vite-plus/test'
import {
  MISSING_URL_HINT,
  missingConvexUrlError,
  useConvexError,
} from '../src/runtime/utils/errors'

describe('use-convex errors', () => {
  it('prefixes messages with [use-convex]', () => {
    expect(useConvexError('boom').message).toBe('[use-convex] boom')
    expect(useConvexError('[use-convex] already').message).toBe('[use-convex] already')
  })

  it('includes an actionable missing-URL hint', () => {
    const err = missingConvexUrlError('signIn')
    expect(err.message).toMatch(/^\[use-convex\] signIn: No Convex URL\./)
    expect(err.message).toContain(MISSING_URL_HINT)
    expect(err.message).toContain('NUXT_PUBLIC_CONVEX_URL')
  })
})
