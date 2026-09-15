function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function token(kind: string, value: string): string {
  return `<span class="tok-${kind}">${escapeHtml(value)}</span>`
}

function highlightInline(text: string): string {
  return text
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return token('id', part)
      }
      return escapeHtml(part)
    })
    .join('')
}

export function highlightMdLine(line: string): string {
  const heading = /^(#{1,6})(\s+)(.*)$/.exec(line)
  if (heading) {
    return `${token('cmt', `${heading[1]}${heading[2]}`)}${token('fn', heading[3] ?? '')}`
  }

  if (line.startsWith('- ')) {
    return `${token('str', '- ')}${highlightInline(line.slice(2))}`
  }

  return highlightInline(line)
}

export function highlightMdLines(source: string): string[] {
  return source.replace(/\n$/, '').split('\n').map((line) => highlightMdLine(line))
}
