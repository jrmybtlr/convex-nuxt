import type { FunctionReference, FunctionReference_future, FunctionType } from 'convex/server'

/**
 * Function reference accepted by use-convex client APIs.
 *
 * Convex 1.46+ introduced {@link FunctionReference_future} for stricter
 * callback argument checking. Generated `api` refs remain plain
 * {@link FunctionReference}; library surfaces accept either kind so callers
 * can pass both (same contract as Convex React hooks).
 */
export type ConvexRef<Type extends FunctionType> =
  | FunctionReference<Type>
  | FunctionReference_future<Type>
