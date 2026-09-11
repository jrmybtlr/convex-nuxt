import { describe, expect, it } from 'vite-plus/test'
import {
  MISSING_URL_HINT,
  missingConvexUrlError,
  unreachableConvexUrlError,
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

  it('explains how to fix an unreachable Convex URL', () => {
    const err = unreachableConvexUrlError('http://127.0.0.1:3210')
    expect(err.message).toContain('http://127.0.0.1:3210')
    expect(err.message).toContain('CONVEX_URL')
    expect(err.message).toContain('NUXT_PUBLIC_CONVEX_URL')
    expect(err.message).toContain('npx convex dev')
  })
})
