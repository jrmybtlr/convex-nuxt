/**
 * Resolve SSR payload vs live subscription — Nuxt equivalent of
 * Next.js `usePreloadedQuery`: `live === undefined ? payload : live`.
 */
export function resolveQueryOverlay<T>(input: {
  skipped: boolean
  liveReady: boolean
  liveData: T | undefined
  liveError: Error | null
  payload: T | null | undefined
  payloadError: Error | null | undefined
  payloadPending: boolean
}): {
  data: T | null | undefined
  error: Error | null
  pending: boolean
  status: 'pending' | 'success' | 'error'
} {
  if (input.skipped) {
    // Keep the SSR/payload snapshot visible while auth or args are gated.
    return {
      data: input.payload,
      error: null,
      pending: false,
      status: 'success',
    }
  }

  // Once the live subscription has delivered (success or error), it owns the
  // overlay — never let a stale HttpClient/payload error mask a healthy live
  // result (e.g. cookie-less client refresh while the socket is authenticated).
  if (input.liveReady) {
    if (input.liveError) {
      return {
        data: input.liveData,
        error: input.liveError,
        pending: false,
        status: 'error',
      }
    }
    return {
      data: input.liveData,
      error: null,
      pending: false,
      status: 'success',
    }
  }

  if (input.payloadError) {
    return {
      data: input.payload,
      error: input.payloadError,
      pending: false,
      status: 'error',
    }
  }

  if (input.payloadPending) {
    return {
      data: input.payload,
      error: null,
      pending: true,
      status: 'pending',
    }
  }

  return {
    data: input.payload,
    error: null,
    pending: false,
    status: 'success',
  }
}
