import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { assertSameOrigin } from '../src/runtime/server/sameOrigin'
import { parseOAuthRedirect } from '../src/runtime/utils/oauthRedirect'

function eventWithHeaders(headers: Record<string, string>): H3Event {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value
  }
  return {
    node: {
      req: { headers: normalized },
    },
  } as H3Event
}

describe('assertSameOrigin', () => {
  it('allows sec-fetch-site same-origin', () => {
    expect(() =>
      assertSameOrigin(eventWithHeaders({ 'sec-fetch-site': 'same-origin' })),
    ).not.toThrow()
  })

  it('allows sec-fetch-site none', () => {
    expect(() =>
      assertSameOrigin(eventWithHeaders({ 'sec-fetch-site': 'none' })),
    ).not.toThrow()
  })

  it('rejects cross-site and same-site', () => {
    expect(() =>
      assertSameOrigin(eventWithHeaders({ 'sec-fetch-site': 'cross-site' })),
    ).toThrow(/Forbidden/)
    expect(() =>
      assertSameOrigin(eventWithHeaders({ 'sec-fetch-site': 'same-site' })),
    ).toThrow(/Forbidden/)
  })

  it('allows matching Origin/Host when Sec-Fetch-Site is absent', () => {
    expect(() =>
      assertSameOrigin(eventWithHeaders({
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      })),
    ).not.toThrow()
  })

  it('rejects mismatched Origin or missing signals', () => {
    expect(() =>
      assertSameOrigin(eventWithHeaders({
        origin: 'https://evil.example',
        host: 'localhost:3000',
      })),
    ).toThrow(/Forbidden/)
    expect(() => assertSameOrigin(eventWithHeaders({}))).toThrow(/Forbidden/)
  })
})

describe('parseOAuthRedirect', () => {
  it('accepts http(s) URLs', () => {
    expect(parseOAuthRedirect('https://github.com/login').href)
      .toBe('https://github.com/login')
    expect(parseOAuthRedirect('http://localhost:3000/callback').protocol)
      .toBe('http:')
  })

  it('rejects non-http(s) and invalid URLs', () => {
    expect(() => parseOAuthRedirect('javascript:alert(1)')).toThrow(/http\(s\)/)
    expect(() => parseOAuthRedirect('data:text/html,hi')).toThrow(/http\(s\)/)
    expect(() => parseOAuthRedirect('not a url')).toThrow(/Invalid/)
  })
})
