/**
 * Runtime knobs for the Convex Auth client that can't live in serializable
 * module options: a custom TokenStorage, extra ambient sign-ins, or a custom
 * `replaceUrl`. Call {@link configureConvexAuth} from a client plugin with
 * `enforce: 'pre'` so the options land before the auth plugin creates the
 * client.
 */

/**
 * Token storage (`@convex-dev/auth/browser` `TokenStorage`). Methods may be
 * sync or async, e.g. Capacitor Preferences or an encrypted store.
 */
export type ConvexAuthTokenStorage = {
  getItem: (key: string) => string | null | undefined | Promise<string | null | undefined>
  setItem: (key: string, value: string) => void | Promise<void>
  removeItem: (key: string) => void | Promise<void>
}

export type { ConvexAuthStorageMode } from './authStorage'

/**
 * An ambient sign-in registration (`AmbientSignInClient` in
 * `@convex-dev/auth`): a method that finishes on its own at startup, like
 * an OAuth callback. Typed loosely here so this file needs no Convex Auth
 * import; the auth plugin passes it straight to `AuthClient`.
 */
export type ConvexAmbientSignIn = {
  id: string
  setup: (ctx: never) => void | { onInit?: () => void }
}

export type ConvexAuthClientOptions = {
  /**
   * Custom token storage. Overrides `convex.auth.storage`.
   */
  storage?: ConvexAuthTokenStorage
  /**
   * Replaces the default ambient sign-ins (`[oauth()]`). Pass `[]` to
   * disable OAuth callback handling, or include `convexOAuth()` alongside
   * your own.
   */
  ambientSignIns?: ConvexAmbientSignIn[]
  /**
   * Replace the page URL after an OAuth callback strips its params.
   * Defaults to `history.replaceState`, then syncs `vue-router`.
   */
  replaceUrl?: (url: string) => void
}

let runtimeOverrides: ConvexAuthClientOptions = {}

/**
 * Set runtime Convex Auth knobs. Merge is shallow — later calls override
 * earlier keys.
 */
export function configureConvexAuth(options: ConvexAuthClientOptions): void {
  runtimeOverrides = { ...runtimeOverrides, ...options }
}

export function getConvexAuthClientOptions(): ConvexAuthClientOptions {
  return { ...runtimeOverrides }
}

/** @internal */
export function resetConvexAuthClientOptionsForTests(): void {
  runtimeOverrides = {}
}
