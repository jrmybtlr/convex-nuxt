import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConvexHttpClient } from 'convex/browser'

/** The access-only bundle the SSR auth proxy returns (refresh token stays in a cookie). */
export type AuthTokens = {
  accessToken: string
  userId: string
}

/** Default Convex Auth route prefix (`convex.auth.routePrefix`). */
const AUTH_ROUTES = '/api/convex/auth'

const playgroundDir = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Cookie jar that stores name=value pairs from Set-Cookie headers. */
export class CookieJar {
  private readonly store = new Map<string, string>()

  absorb(response: Response): void {
    const headers = response.headers as Headers & {
      getSetCookie?: () => string[]
    }
    const lines: string[] =
      typeof headers.getSetCookie === 'function' ? [...headers.getSetCookie()] : []
    if (lines.length === 0) {
      const single = response.headers.get('set-cookie')
      if (single) {
        lines.push(single)
      }
    }
    for (const line of lines) {
      const pair = line.split(';')[0]?.trim()
      if (!pair) {
        continue
      }
      const eq = pair.indexOf('=')
      if (eq <= 0) {
        continue
      }
      const name = pair.slice(0, eq)
      const value = pair.slice(eq + 1)
      this.store.set(name, value)
    }
  }

  header(): string | undefined {
    if (this.store.size === 0) {
      return undefined
    }
    return [...this.store.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  clear(): void {
    this.store.clear()
  }
}

function parseEnvFile(path: string): Record<string, string> {
  try {
    const text = readFileSync(path, 'utf8')
    const out: Record<string, string> = {}
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }
      const eq = trimmed.indexOf('=')
      if (eq <= 0) {
        continue
      }
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

export function resolveBaseURL(): string {
  return process.env.E2E_BASE_URL ?? 'http://localhost:3000'
}

export function resolveConvexURL(): string {
  if (process.env.NUXT_PUBLIC_CONVEX_URL) {
    return process.env.NUXT_PUBLIC_CONVEX_URL
  }
  if (process.env.CONVEX_URL) {
    return process.env.CONVEX_URL
  }
  const fromLocal = parseEnvFile(join(playgroundDir, '.env.local'))
  const fromEnv = parseEnvFile(join(playgroundDir, '.env'))
  const url =
    fromLocal.NUXT_PUBLIC_CONVEX_URL ??
    fromLocal.CONVEX_URL ??
    fromEnv.NUXT_PUBLIC_CONVEX_URL ??
    fromEnv.CONVEX_URL
  if (!url) {
    throw new Error('Convex URL missing — set NUXT_PUBLIC_CONVEX_URL or run pnpm run dev:backend')
  }
  return url
}

/**
 * Sign up with username + password through the Nitro auth proxy, the same
 * path the browser uses in SSR mode. The proxy sets the httpOnly
 * `__convexAuthJWT` / `__convexAuthRefreshToken` cookies on `jar` and
 * returns the access token.
 */
export async function signUpPassword(
  baseURL: string,
  jar: CookieJar,
  username: string,
  password: string,
): Promise<AuthTokens> {
  const res = await fetch(`${baseURL}${AUTH_ROUTES}/signin?path=/api/mutation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({
      path: 'auth:signUpWithUsernamePassword',
      format: 'convex_encoded_json',
      args: [{ username, password }],
    }),
  })
  jar.absorb(res)
  if (!res.ok) {
    throw new Error(`sign-up proxy failed: ${res.status} ${await res.text()}`)
  }
  const payload = (await res.json()) as {
    status: string
    value?: { status: string; tokens?: AuthTokens; userError?: unknown }
    errorMessage?: string
  }
  if (payload.status !== 'success' || payload.value?.status !== 'complete') {
    throw new Error(`sign-up failed: ${JSON.stringify(payload.value ?? payload.errorMessage)}`)
  }
  const tokens = payload.value.tokens
  if (!tokens?.accessToken || 'refreshToken' in tokens) {
    throw new Error('sign-up must return an access-only bundle (refresh token in a cookie)')
  }
  return tokens
}

/** Revoke the session and clear the auth cookies through the sign-out route. */
export async function signOutSession(baseURL: string, jar: CookieJar): Promise<void> {
  const cookie = jar.header()
  const res = await fetch(`${baseURL}${AUTH_ROUTES}/signout`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseURL,
      ...(cookie ? { cookie } : {}),
    },
    body: '{}',
  })
  jar.absorb(res)
  jar.clear()
}

export async function fetchWithJar(
  baseURL: string,
  jar: CookieJar,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  const cookie = jar.header()
  if (cookie) {
    headers.set('cookie', cookie)
  }
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const res = await fetch(`${baseURL}${path}`, {
    ...init,
    headers,
  })
  jar.absorb(res)
  return res
}

export function authedConvexClient(convexUrl: string, token: string): ConvexHttpClient {
  const http = new ConvexHttpClient(convexUrl)
  http.setAuth(token)
  return http
}
