const KEYWORDS = new Set([
  'const',
  'await',
  'return',
  'true',
  'false',
  'null',
  'undefined',
  'new',
  'typeof',
  'async',
  'function',
])

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function token(kind: string, value: string): string {
  return `<span class="tok-${kind}">${escapeHtml(value)}</span>`
}

export function highlightTsLine(line: string): string {
  if (line.length === 0) {
    return ''
  }

  let out = ''
  let i = 0

  while (i < line.length) {
    if (line.startsWith('//', i)) {
      out += token('cmt', line.slice(i))
      break
    }

    if (line.startsWith('/*', i)) {
      const close = line.indexOf('*/', i + 2)
      const end = close === -1 ? line.length : close + 2
      out += token('cmt', line.slice(i, end))
      i = end
      continue
    }

    const quote = line[i]
    if (quote === "'" || quote === '"' || quote === '`') {
      let j = i + 1
      while (j < line.length) {
        if (line[j] === '\\') {
          j += 2
          continue
        }
        if (line[j] === quote) {
          j += 1
          break
        }
        j += 1
      }
      out += token('str', line.slice(i, j))
      i = j
      continue
    }

    const char = line[i] ?? ''
    if (/[A-Za-z_$]/.test(char)) {
      let j = i + 1
      while (j < line.length && /[\w$]/.test(line[j] ?? '')) {
        j += 1
      }
      const word = line.slice(i, j)
      let k = j
      while (k < line.length && line[k] === ' ') {
        k += 1
      }
      if (KEYWORDS.has(word)) {
        out += token('kw', word)
      } else if (line[k] === '(') {
        out += token('fn', word)
      } else if (word === 'api' || word === 'event' || word === 'localStore') {
        out += token('id', word)
      } else {
        out += escapeHtml(word)
      }
      i = j
      continue
    }

    if (/[0-9]/.test(char)) {
      let j = i + 1
      while (j < line.length && /[\d._]/.test(line[j] ?? '')) {
        j += 1
      }
      out += token('num', line.slice(i, j))
      i = j
      continue
    }

    out += escapeHtml(char)
    i += 1
  }

  return out
}

export function highlightTsLines(source: string): string[] {
  return source.split('\n').map((line) => highlightTsLine(line))
}
