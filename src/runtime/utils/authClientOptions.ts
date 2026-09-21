/**
 * Runtime Convex Auth client knobs (React `ConvexAuthProvider` parity).
 *
 * Serializable defaults also live on `convex.auth` module options
 * (`storageNamespace`, `storage: 'localStorage' | 'inMemory'`,
 * `shouldHandleCode: boolean`). Call {@link configureConvexAuth} from a
 * client plugin (`enforce: 'pre'`) for `replaceURL`, function
 * `shouldHandleCode`, or a custom {@link ConvexAuthTokenStorage}.
 */

export type ConvexAuthTokenStorage = {
  getItem: (key: string) => string | undefined | null | Promise<string | undefined | null>
  setItem: (key: string, value: string) => void | Promise<void>
  removeItem: (key: string) => void | Promise<void>
}

export type ConvexAuthStorageMode = 'localStorage' | 'inMemory'

export type ConvexAuthClientOptions = {
  /**
   * When `false` (or a function returning false), ignore `?code=` OAuth
   * callbacks. Defaults to handling the code when a verifier is stored.
   */
  shouldHandleCode?: boolean | (() => boolean)
  /**
   * Replace the URL after stripping `?code=` (JS routers). Defaults to
   * `history.replaceState`.
   */
  replaceURL?: (relativeUrl: string) => void | Promise<void>
  /**
   * Token storage. `'localStorage'` (default), `'inMemory'`, or a custom
   * {@link ConvexAuthTokenStorage} (e.g. `sessionStorage`, Secure Store).
   */
  storage?: ConvexAuthStorageMode | ConvexAuthTokenStorage
  /**
   * Namespace for storage keys (non-alphanumeric chars stripped). Defaults
   * to the Convex deployment URL.
   */
  storageNamespace?: string
}

/** Serializable subset safe for `runtimeConfig.public.convex.auth`. */
export type ConvexAuthModuleClientOptions = {
  shouldHandleCode?: boolean
  storage?: ConvexAuthStorageMode
  storageNamespace?: string
}

let runtimeOverrides: ConvexAuthClientOptions = {}
let moduleDefaults: ConvexAuthModuleClientOptions = {}

/**
 * Set runtime Convex Auth knobs. Merge is shallow — later calls override
 * earlier keys. Prefer calling from a client plugin with `enforce: 'pre'`
 * so options land before the auth plugin consumes OAuth codes.
 */
export function configureConvexAuth(options: ConvexAuthClientOptions): void {
  runtimeOverrides = { ...runtimeOverrides, ...options }
}

/** @internal */
export function setConvexAuthModuleDefaults(options: ConvexAuthModuleClientOptions): void {
  moduleDefaults = { ...options }
}

/** Merged module defaults + {@link configureConvexAuth} overrides. */
export function getConvexAuthClientOptions(): ConvexAuthClientOptions {
  return {
    ...moduleDefaults,
    ...runtimeOverrides,
  }
}

/** @internal */
export function resetConvexAuthClientOptionsForTests(): void {
  runtimeOverrides = {}
  moduleDefaults = {}
}

const inMemory = new Map<string, string>()

/** @internal */
export function createInMemoryTokenStorage(): ConvexAuthTokenStorage {
  return {
    getItem: (key) => inMemory.get(key) ?? null,
    setItem: (key, value) => {
      inMemory.set(key, value)
    },
    removeItem: (key) => {
      inMemory.delete(key)
    },
  }
}

/** @internal */
export function resetInMemoryTokenStorageForTests(): void {
  inMemory.clear()
}

const localStorageAdapter: ConvexAuthTokenStorage = {
  getItem: (key) => {
    if (typeof window === 'undefined') {
      return null
    }
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // ignore quota / private mode
    }
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.removeItem(key)
    } catch {
      // ignore
    }
  },
}

/** Resolve the active token storage from merged auth options. */
export function resolveAuthTokenStorage(
  options: ConvexAuthClientOptions = getConvexAuthClientOptions(),
): ConvexAuthTokenStorage {
  const storage = options.storage
  if (storage === 'inMemory') {
    return createInMemoryTokenStorage()
  }
  if (storage && typeof storage === 'object') {
    return storage
  }
  return localStorageAdapter
}
