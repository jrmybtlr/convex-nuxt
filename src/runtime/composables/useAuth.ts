import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { useConvexContext, type ConvexAuthBinding } from '../utils/context'
import { useConvexAuth, type UseConvexAuthReturn } from './useConvexAuth'
import {
  OAUTH_ACTIONS_KEY,
  OAUTH_FLOW_ERROR_KEY,
  OAUTH_SETUP_ID,
  type OAuthActions,
  type OAuthCompleteResult,
  type OAuthFlowError,
  type OAuthProviderRefs,
  type OAuthSignInOptions,
  type OAuthStartResult,
} from '../auth/oauth'

export type {
  OAuthCompleteResult,
  OAuthFlowError,
  OAuthProviderRefs,
  OAuthSignInOptions,
  OAuthStartResult,
} from '../auth/oauth'

/** The session a method's sign-in returns (`TokenBundle` / `SlimTokenBundle`). */
export type ConvexAuthSession = {
  accessToken: string
  userId: string
  refreshToken?: string
  refreshTokenExpiresAt?: number
}

/**
 * The shared sign-in envelope every Convex Auth v2 sign-in function returns,
 * widened with the `OTHER_ERROR` arm for thrown errors.
 */
export type ConvexSignInResult<Result> =
  | Result
  | { status: 'error'; userError: { error: 'OTHER_ERROR'; cause: unknown } }

export interface UseAuthReturn extends UseConvexAuthReturn {
  /** Current access token (JWT), or null. Short-lived — don't persist it. */
  token: ComputedRef<string | null>
  /** Adopt a session returned by a method's sign-in function. */
  setSession: (session: ConvexAuthSession) => Promise<void>
  /** Revoke the session on the server and clear it locally. */
  signOut: () => Promise<void>
}

function useBinding(name: string): ConvexAuthBinding | null {
  const ctx = useConvexContext()
  if (!import.meta.server && !ctx.convexAuth) {
    throw new Error(
      `[use-convex] ${name} requires \`convex.auth.provider: 'convex-auth'\` in nuxt.config.`,
    )
  }
  return ctx.convexAuth ?? null
}

function requireBinding(name: string): ConvexAuthBinding {
  const binding = useConvexContext().convexAuth
  if (!binding) {
    throw new Error(`[use-convex] ${name} is browser-only and requires Convex Auth.`)
  }
  return binding
}

/**
 * Convex Auth v2 session state and actions (React `useAuthActions` +
 * `useConvexAuth` parity): `isLoading`, `isAuthenticated`, `isRefreshing`,
 * `hasSsrSession`, `showAuthedUi`, `token`, `setSession`, `signOut`. Sign in with {@link useConvexSignIn} or
 * {@link useOAuthSignIn}.
 */
export function useAuth(): UseAuthReturn {
  const binding = useBinding('useAuth')
  const auth = useConvexAuth()
  return {
    ...auth,
    token: computed(() => binding?.state.value.token ?? null),
    setSession: (session) => requireBinding('setSession').setSession(session),
    signOut: () => signOut(),
  }
}

/** Revoke the current Convex Auth session and clear it locally. */
export async function signOut(): Promise<void> {
  await requireBinding('signOut').signOut()
}

/**
 * Run any Convex Auth v2 sign-in function (username/email + password
 * sign-in or sign-up, anonymous, …) and adopt the session it returns.
 *
 * In SSR mode the call goes through the Nitro auth proxy, so the function
 * must be listed in `convex.auth.signIn`.
 *
 * @example
 * ```ts
 * const { run: signIn, pending } = useConvexSignIn(api.auth.signInWithUsernamePassword)
 * const result = await signIn({ username, password })
 * if (result.status === 'error') showError(result.userError)
 * ```
 */
export function useConvexSignIn<Fn extends FunctionReference<'mutation' | 'action', 'public'>>(
  fn: Fn,
  options: {
    /**
     * `FunctionReference` kinds are type-only, so say when the sign-in
     * function is an action. Convex Auth's built-in methods use mutations.
     * @default 'mutation'
     */
    kind?: 'mutation' | 'action'
  } = {},
): {
  run: (args: FunctionArgs<Fn>) => Promise<ConvexSignInResult<FunctionReturnType<Fn>>>
  pending: Readonly<Ref<boolean>>
} {
  useBinding('useConvexSignIn')
  const ctx = useConvexContext()
  const pending = ref(false)

  const run = async (args: FunctionArgs<Fn>) => {
    const binding = ctx.convexAuth
    if (!binding) {
      throw new Error('[use-convex] useConvexSignIn().run is browser-only.')
    }
    pending.value = true
    try {
      const call = options.kind === 'action' ? binding.signInApi.action : binding.signInApi.mutation
      const result = (await call(fn as never, args as Record<string, unknown>)) as {
        status?: string
        tokens?: ConvexAuthSession
      }
      if (result?.status === 'complete' && result.tokens) {
        await binding.setSession(result.tokens)
      }
      return result as FunctionReturnType<Fn>
    } catch (cause) {
      return { status: 'error' as const, userError: { error: 'OTHER_ERROR' as const, cause } }
    } finally {
      pending.value = false
    }
  }

  return { run, pending }
}

/**
 * OAuth state not tied to one provider: `flowError` explains why the last
 * redirect-back failed, on whichever page the provider returned to.
 */
export function useOAuth(): { flowError: Readonly<Ref<OAuthFlowError | null>> } {
  const binding = useBinding('useOAuth')
  if (!binding) {
    return { flowError: shallowRef(null) }
  }
  const value = binding.ambientValue<OAuthFlowError | null>(OAUTH_SETUP_ID, OAUTH_FLOW_ERROR_KEY)
  return { flowError: computed(() => value.value ?? null) }
}

/**
 * Start a provider's OAuth flow (navigates to the provider), or finish one
 * started elsewhere with `{ code }`.
 *
 * @example
 * ```ts
 * const { signIn } = useOAuthSignIn({
 *   providerName: 'github',
 *   startSignIn: api.auth.startSignInWithGithub,
 *   completeSignIn: api.auth.completeSignInWithGithub,
 * })
 * ```
 */
export function useOAuthSignIn(refs: OAuthProviderRefs): {
  signIn: {
    (options: OAuthSignInOptions & { code: string }): Promise<OAuthCompleteResult>
    (options?: Omit<OAuthSignInOptions, 'code'>): Promise<OAuthStartResult>
  }
} {
  const binding = useBinding('useOAuthSignIn')
  const actions = binding?.ambientValue<OAuthActions>(OAUTH_SETUP_ID, OAUTH_ACTIONS_KEY)
  const signIn = (async (options?: OAuthSignInOptions) => {
    const current = actions?.value
    if (!current) {
      throw new Error(
        '[use-convex] OAuth is not registered. Include convexOAuth() in configureConvexAuth({ ambientSignIns }).',
      )
    }
    return await current.signIn(refs, options)
  }) as ReturnType<typeof useOAuthSignIn>['signIn']
  return { signIn }
}
