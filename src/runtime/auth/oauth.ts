/**
 * OAuth ambient sign-in for Convex Auth v2.
 *
 * Port of `@convex-dev/auth`'s framework-agnostic OAuth client, which the
 * package only ships behind its React entry point. Same wire contract:
 * `startSignIn({ redirectTo })` → `{ redirect, state }`; the state is kept in
 * the sign-in's storage, and the callback's `convexAuthCode` is redeemed with
 * `completeSignIn({ code, state })` through the sign-in API (the auth proxy
 * under SSR).
 */
import type { AuthClient, AuthClientConfig } from '@convex-dev/auth/browser'
import { getFunctionName, makeFunctionReference, type FunctionReference } from 'convex/server'

type AmbientSignIns = NonNullable<AuthClientConfig['ambientSignIns']>
export type AmbientSignInClient = AmbientSignIns['signIns'][number]
export type AmbientSignInContext = Parameters<AmbientSignInClient['setup']>[0]

/** Callback params written by the Convex Auth OAuth component. */
export const OAUTH_CODE_PARAM = 'convexAuthCode'
export const OAUTH_ERROR_PARAM = 'convexAuthError'

export const OAUTH_SETUP_ID = 'oauth'
export const OAUTH_ACTIONS_KEY = 'actions'
export const OAUTH_FLOW_ERROR_KEY = 'flowError'
const OAUTH_FLOW_STORAGE_KEY = 'flow'

/** A provider's `startSignIn*` / `completeSignIn*` mutations plus its name. */
export type OAuthProviderRefs = {
  /** Label only, e.g. `'github'`. */
  providerName: string
  startSignIn: FunctionReference<
    'mutation',
    'public',
    { redirectTo: string },
    { redirect: string; state: string }
  >
  completeSignIn: FunctionReference<'mutation', 'public', { code: string; state: string }, any>
}

/**
 * Why a flow failed after the identity provider sent the user back.
 * Switch on `error` and supply your own copy.
 */
export type OAuthFlowError =
  | { error: 'ACCESS_DENIED' }
  | { error: 'EXPIRED' }
  | { error: 'INVALID_FLOW' }
  | { error: 'OTHER_ERROR'; cause: unknown }

export type OAuthStartResult =
  | { status: 'redirect'; redirect: URL }
  | { status: 'error'; userError: { error: 'OTHER_ERROR'; cause: unknown } }

export type OAuthCompleteResult =
  | { status: 'complete' }
  | { status: 'error'; userError: OAuthFlowError }

export type OAuthSignInOptions = {
  /** Where the provider sends the user back. Defaults to the current URL. */
  redirectTo?: string
  /** Finish a flow started elsewhere instead of starting one. */
  code?: string
}

export type OAuthActions = {
  signIn: (
    refs: OAuthProviderRefs,
    options?: OAuthSignInOptions,
  ) => Promise<OAuthStartResult | OAuthCompleteResult>
}

type PendingFlow = { providerName: string; state: string; completeSignIn: string }

const RETRY_BACKOFF = [500, 2000]

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && /network|failed to fetch|load failed/i.test(error.message)
}

async function retryOnNetworkError<T>(fn: () => Promise<T>): Promise<T> {
  for (const backoff of RETRY_BACKOFF) {
    try {
      return await fn()
    } catch (error) {
      if (!isNetworkError(error)) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, backoff + 100 * Math.random()))
    }
  }
  return await fn()
}

function callbackFlowError(param: string): OAuthFlowError {
  switch (param) {
    case 'access_denied':
      return { error: 'ACCESS_DENIED' }
    case 'expired':
      return { error: 'EXPIRED' }
    default:
      return { error: 'OTHER_ERROR', cause: param }
  }
}

function currentHref(): string | null {
  if (typeof window === 'undefined' || window.location === undefined) {
    return null
  }
  return window.location.href
}

type SignInStorage = AmbientSignInContext['storage']

async function takePendingFlow(storage: SignInStorage): Promise<PendingFlow | null> {
  const raw = await storage.get(OAUTH_FLOW_STORAGE_KEY)
  await storage.remove(OAUTH_FLOW_STORAGE_KEY)
  if (raw === null || raw === undefined) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PendingFlow>
    if (
      typeof parsed.providerName !== 'string' ||
      typeof parsed.state !== 'string' ||
      typeof parsed.completeSignIn !== 'string'
    ) {
      return null
    }
    return parsed as PendingFlow
  } catch {
    return null
  }
}

async function dropPendingFlow(storage: SignInStorage): Promise<void> {
  try {
    await storage.remove(OAUTH_FLOW_STORAGE_KEY)
  } catch {
    // The flow already ended.
  }
}

/**
 * The OAuth ambient sign-in. Registered by default; pass it explicitly via
 * `configureConvexAuth({ ambientSignIns: [convexOAuth(), …] })` when adding
 * others.
 */
export type ConvexOAuthOptions = {
  /**
   * Where to keep the pending flow across the provider redirect, when the
   * session token storage does not survive navigation (e.g. in-memory
   * tokens). Defaults to the client's token storage.
   */
  flowStorage?: {
    getItem: (key: string) => string | null | undefined | Promise<string | null | undefined>
    setItem: (key: string, value: string) => void | Promise<void>
    removeItem: (key: string) => void | Promise<void>
  }
  /** Key namespace for `flowStorage`, typically the deployment URL. */
  namespace?: string
}

export function convexOAuth(options: ConvexOAuthOptions = {}): AmbientSignInClient {
  const setup = (ctx: AmbientSignInContext) => {
    const { values, signInApi, convex, replaceUrl } = ctx
    const flowStorage = options.flowStorage
    const suffix = (options.namespace ?? '').replace(/[^a-z0-9]/gi, '')
    const flowKey = (key: string) => `__convexAuthOAuth_${key}_${suffix}`
    const storage: SignInStorage = flowStorage
      ? {
          get: (key) => flowStorage.getItem(flowKey(key)),
          set: (key, value) => flowStorage.setItem(flowKey(key), value),
          remove: (key) => flowStorage.removeItem(flowKey(key)),
        }
      : ctx.storage
    const client = ctx.client as AuthClient
    const setFlowError = (flowError: OAuthFlowError | null) => {
      values.set(OAUTH_FLOW_ERROR_KEY, flowError)
    }

    const redeem = async (code: string): Promise<OAuthCompleteResult> => {
      try {
        const pending = await takePendingFlow(storage)
        if (pending === null) {
          return { status: 'error', userError: { error: 'INVALID_FLOW' } }
        }
        const completeSignIn = makeFunctionReference<'mutation'>(pending.completeSignIn)
        const result = (await retryOnNetworkError(() =>
          signInApi.mutation(completeSignIn as never, { code, state: pending.state } as never),
        )) as { status: string; tokens?: unknown }
        if (result.status === 'error') {
          return { status: 'error', userError: { error: 'EXPIRED' } }
        }
        await client.setSession(result.tokens as Parameters<AuthClient['setSession']>[0])
        return { status: 'complete' }
      } catch (cause) {
        return { status: 'error', userError: { error: 'OTHER_ERROR', cause } }
      }
    }

    const handleCallback = () => {
      const href = currentHref()
      if (href === null) {
        return
      }
      const url = new URL(href)
      const code = url.searchParams.get(OAUTH_CODE_PARAM)
      const errorParam = url.searchParams.get(OAUTH_ERROR_PARAM)
      if (code === null && errorParam === null) {
        return
      }
      url.searchParams.delete(OAUTH_CODE_PARAM)
      url.searchParams.delete(OAUTH_ERROR_PARAM)
      replaceUrl(url.toString())
      if (errorParam !== null) {
        void dropPendingFlow(storage)
        setFlowError(callbackFlowError(errorParam))
        return
      }
      if (code === null) {
        return
      }
      void client.withSignInPending(async () => {
        const result = await redeem(code)
        if (result.status === 'error') {
          setFlowError(result.userError)
        }
      })
    }

    const signIn: OAuthActions['signIn'] = async (refs, options) => {
      const code = options?.code
      if (code !== undefined) {
        setFlowError(null)
        return await client.withSignInPending(() => redeem(code))
      }
      const href = currentHref()
      const redirectTo = options?.redirectTo ?? href
      if (redirectTo === null) {
        throw new Error('`redirectTo` is required where there is no current page URL.')
      }
      setFlowError(null)
      try {
        const { redirect, state } = (await convex.mutation(
          refs.startSignIn as never,
          {
            redirectTo,
          } as never,
        )) as { redirect: string; state: string }
        await storage.set(
          OAUTH_FLOW_STORAGE_KEY,
          JSON.stringify({
            providerName: refs.providerName,
            state,
            completeSignIn: getFunctionName(refs.completeSignIn),
          } satisfies PendingFlow),
        )
        const url = new URL(redirect)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error('OAuth redirect must be http(s)')
        }
        if (href !== null) {
          window.location.href = url.toString()
        }
        return { status: 'redirect', redirect: url }
      } catch (cause) {
        return { status: 'error', userError: { error: 'OTHER_ERROR', cause } }
      }
    }

    values.set(OAUTH_ACTIONS_KEY, { signIn } satisfies OAuthActions)
    setFlowError(null)
    return { onInit: handleCallback }
  }
  return { id: OAUTH_SETUP_ID, setup } as AmbientSignInClient
}
