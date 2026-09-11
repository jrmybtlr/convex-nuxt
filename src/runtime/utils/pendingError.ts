import { computed, ref } from 'vue'

/**
 * Shared pending/error state for browser-only Convex client operations
 * (`useConvexMutation`, `useConvexAction`).
 */
export function createPendingErrorState() {
  const error = ref<Error | null>(null)
  const pendingCount = ref(0)

  async function withPending<T>(fn: () => Promise<T>): Promise<T> {
    pendingCount.value++
    error.value = null
    try {
      return await fn()
    }
    catch (cause) {
      const err = cause instanceof Error ? cause : new Error(String(cause))
      error.value = err
      throw err
    }
    finally {
      pendingCount.value--
    }
  }

  return {
    error,
    pending: computed(() => pendingCount.value > 0),
    withPending,
  }
}
