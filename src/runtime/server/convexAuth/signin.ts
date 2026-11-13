import { defineEventHandler } from 'h3'
import { runWebHandler, useConvexAuthServer } from './setup'

/** Convex Auth v2 `convexProxyHandler` from `@convex-dev/auth/ssr`. */
export default defineEventHandler((event) =>
  runWebHandler(event, useConvexAuthServer(event).convexProxyHandler),
)
