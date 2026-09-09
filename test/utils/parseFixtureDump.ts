function parseFixtureDump(html: string): unknown {
  const match = html.match(/id="fixture-dump"[^>]*>([^<]+)</)
  if (!match?.[1]) {
    throw new Error('fixture-dump not found in HTML')
  }
  const decoded = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
  return JSON.parse(decoded)
}

export { parseFixtureDump }
