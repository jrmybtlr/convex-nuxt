import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'

export type AuthTokens = {
  token: string
  refreshToken: string
}

type SignInActionResult = {
  tokens?: AuthTokens | null
  redirect?: string
  verifier?: string
  started?: boolean
}

const authSignIn = makeFunctionReference<
  'action',
  {
    provider?: string
    params?: Record<string, string>
  },
  SignInActionResult
>('auth:signIn')

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

export async function signUpPassword(
  convexUrl: string,
  email: string,
  password: string,
): Promise<AuthTokens> {
  const http = new ConvexHttpClient(convexUrl)
  const result = await http.action(authSignIn, {
    provider: 'password',
    params: {
      email,
      password,
      flow: 'signUp',
    },
  })
  if (!result.tokens?.token || !result.tokens.refreshToken) {
    throw new Error('signUp did not return auth tokens')
  }
  return result.tokens
}

export async function establishHttpOnlySession(
  baseURL: string,
  jar: CookieJar,
  tokens: AuthTokens,
): Promise<void> {
  const res = await fetch(`${baseURL}/api/convex/auth/session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      origin: baseURL,
    },
    body: JSON.stringify({
      token: tokens.token,
      refreshToken: tokens.refreshToken,
    }),
  })
  jar.absorb(res)
  if (!res.ok) {
    throw new Error(`session POST failed: ${res.status} ${await res.text()}`)
  }
}

export async function clearHttpOnlySession(baseURL: string, jar: CookieJar): Promise<void> {
  const cookie = jar.header()
  const res = await fetch(`${baseURL}/api/convex/auth/session`, {
    method: 'DELETE',
    headers: {
      'sec-fetch-site': 'same-origin',
      origin: baseURL,
      ...(cookie ? { cookie } : {}),
    },
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
