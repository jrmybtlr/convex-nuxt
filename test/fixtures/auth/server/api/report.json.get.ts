// A Nitro endpoint whose path has a dot: the Convex Auth session middleware
// must still run for it (it is not a static asset).
export default defineEventHandler((event) => ({
  middlewareRan: (event.context as { convexAuthToken?: unknown }).convexAuthToken !== undefined,
}))
