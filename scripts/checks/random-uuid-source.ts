import type { Finding, SourceFile } from './rules.ts'

function commentEnd(text: string, index: number): number | null {
  if (text.startsWith('//', index)) {
    const end = text.indexOf('\n', index)
    return end === -1 ? text.length : end
  }
  if (text.startsWith('/*', index)) {
    const end = text.indexOf('*/', index + 2)
    return end === -1 ? text.length : end + 2
  }
  return null
}

function stringEnd(text: string, index: number): number | null {
  const quote = text[index]
  if (quote !== "'" && quote !== '"' && quote !== '`') return null
  let end = index + 1
  while (end < text.length && text[end] !== quote) end += text[end] === '\\' ? 2 : 1
  return end + 1
}

function blankComments(text: string): string {
  let result = ''
  let index = 0
  while (index < text.length) {
    const comment = commentEnd(text, index)
    if (comment === null) {
      const end = stringEnd(text, index) ?? index + 1
      result += text.slice(index, end)
      index = end
      continue
    }
    result += text.slice(index, comment).replace(/[^\n]/g, ' ')
    index = comment
  }
  return result
}

export function checkRandomUuidSource(file: SourceFile): Finding[] {
  if (!/^packages\/[^/]+\/src\//.test(file.path) || /\.(?:test(?:-helper)?|spec)\.[mc]?[jt]sx?$/.test(file.path)) return []
  if (file.path === 'packages/format/src/document-identity.ts') return []
  const source = blankComments(file.text)
  const match = /(?:\.|\?\.)\s*randomUUID\s*(?:\?\.)?\s*\(/.exec(source)
  if (!match) return []
  const line = source.slice(0, match.index).split('\n').length
  return [
    {
      rule: 'random-uuid-source',
      path: `${file.path}:${line}`,
      message: 'calls randomUUID directly; use defaultNewId from @segnavia/format so ids work outside a secure context.',
    },
  ]
}
