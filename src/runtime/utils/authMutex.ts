/**
 * Single-flight mutex for token refresh (mirrors @convex-dev/auth/react).
 * Prefers `navigator.locks` when available; falls back to an in-memory queue.
 */

type MutexState = {
  currentlyRunning: Promise<void> | null
  waiting: Array<() => Promise<void>>
}

declare global {
  var __convexNuxtAuthMutexes: Record<string, MutexState> | undefined
}

export async function withRefreshMutex<T>(key: string, callback: () => Promise<T>): Promise<T> {
  const lockManager = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (lockManager !== undefined) {
    return await lockManager.request(key, callback)
  }
  return await manualMutex(key, callback)
}

async function manualMutex<T>(key: string, callback: () => Promise<T>): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const wrapped = () =>
      callback()
        .then(resolve)
        .catch(reject)
        .then(() => undefined)

    void enqueueCallbackForMutex(key, wrapped)
  })
}

function getMutexValue(key: string): MutexState {
  if (globalThis.__convexNuxtAuthMutexes === undefined) {
    globalThis.__convexNuxtAuthMutexes = {}
  }
  let mutex = globalThis.__convexNuxtAuthMutexes[key]
  if (mutex === undefined) {
    mutex = { currentlyRunning: null, waiting: [] }
    globalThis.__convexNuxtAuthMutexes[key] = mutex
  }
  return mutex
}

async function enqueueCallbackForMutex(key: string, callback: () => Promise<void>): Promise<void> {
  const mutex = getMutexValue(key)
  if (mutex.currentlyRunning === null) {
    globalThis.__convexNuxtAuthMutexes![key] = {
      currentlyRunning: callback().finally(() => {
        const next = getMutexValue(key).waiting.shift()
        getMutexValue(key).currentlyRunning = null
        if (next !== undefined) {
          void enqueueCallbackForMutex(key, next)
        }
      }),
      waiting: [],
    }
  } else {
    globalThis.__convexNuxtAuthMutexes![key] = {
      ...mutex,
      waiting: [...mutex.waiting, callback],
    }
  }
}

/** Test helper — clear in-memory mutex state between tests. */
export function resetAuthMutexesForTests(): void {
  globalThis.__convexNuxtAuthMutexes = undefined
}
