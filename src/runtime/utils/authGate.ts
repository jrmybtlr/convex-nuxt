/**
 * Apply `{ authenticated: true }` on top of caller args.
 *
 * Caller `'skip'` always wins (unrelated gates). Auth skip is applied after,
 * so payload keys can still be derived from the raw args (non-empty args must
 * not remap to `{}` while internally skipped).
 */
export function resolveAuthGatedArgs<T>(
  raw: T | 'skip',
  options: {
    authenticated?: boolean
    isAuthenticated: boolean
  },
): T | 'skip' {
  if (raw === 'skip') {
    return 'skip'
  }
  if (options.authenticated && !options.isAuthenticated) {
    return 'skip'
  }
  return raw
}
