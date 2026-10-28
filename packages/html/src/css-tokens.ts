export type CssTokenKind = 'at' | 'bad-url' | 'close' | 'function' | 'open' | 'semicolon' | 'string' | 'url' | 'word'

export interface CssToken {
  end: number
  kind: CssTokenKind
  start: number
  value: string
}

function newlineEnd(source: string, at: number): number {
  return source[at] === '\r' && source[at + 1] === '\n' ? at + 2 : at + 1
}

export function cssEscape(source: string, at: number): [string, number] {
  let end = at + 1
  if (end >= source.length) return ['', end]
  if (/[0-9a-f]/i.test(source[end] ?? '')) {
    const start = end
    while (end < source.length && end - start < 6 && /[0-9a-f]/i.test(source[end] ?? '')) end++
    const point = Number.parseInt(source.slice(start, end), 16)
    if (source[end] === '\r' && source[end + 1] === '\n') end += 2
    else if (/\s/.test(source[end] ?? '')) end++
    return [point === 0 || point > 0x10ffff ? '\ufffd' : String.fromCodePoint(point), end]
  }
  if (source[end] === '\n' || source[end] === '\r' || source[end] === '\f') return ['', newlineEnd(source, end)]
  return [source[end] ?? '', end + 1]
}

function name(source: string, at: number): [string, number] {
  let value = ''
  let end = at
  while (end < source.length) {
    const character = source[end] ?? ''
    if (/[\w-]/.test(character) || character.charCodeAt(0) >= 0x80) {
      value += character
      end++
      continue
    }
    if (character !== '\\') break
    const escaped = cssEscape(source, end)
    value += escaped[0]
    end = escaped[1]
  }
  return [value.toLowerCase(), end]
}

function skipTrivia(source: string, at: number): number {
  if (/\s/.test(source[at] ?? '')) return at + 1
  if (!source.startsWith('/*', at)) return at
  const close = source.indexOf('*/', at + 2)
  return close < 0 ? source.length : close + 2
}

function stringToken(source: string, start: number): CssToken {
  const quote = source[start] ?? ''
  let at = start + 1
  let value = ''
  while (at < source.length && source[at] !== quote) {
    if (source[at] === '\n' || source[at] === '\r' || source[at] === '\f') break
    if (source[at] === '\\') {
      const escaped = cssEscape(source, at)
      value += escaped[0]
      at = escaped[1]
    } else value += source[at++] ?? ''
  }
  if (source[at] === quote) at++
  return { end: at, kind: 'string', start, value }
}

function badUrlEnd(source: string, at: number): number {
  while (at < source.length) {
    if (source[at] === ')') return at + 1
    if (source[at] === '\\') at = cssEscape(source, at)[1]
    else at++
  }
  return at
}

function invalidUrlCharacter(character: string): boolean {
  const code = character.charCodeAt(0)
  return character === '"' || character === "'" || character === '(' || code <= 8 || code === 11 || (code >= 14 && code <= 31) || code === 127
}

function urlAfterWhitespace(source: string, start: number, at: number, value: string): CssToken {
  let end = at
  while (/\s/.test(source[end] ?? '')) end++
  if (source[end] === ')') return { end: end + 1, kind: 'url', start, value: value.trim().toLowerCase() }
  return { end: badUrlEnd(source, end), kind: 'bad-url', start, value }
}

function escapedUrlPart(source: string, start: number, at: number, value: string): CssToken | [string, number] {
  const escaped = cssEscape(source, at)
  if (escaped[1] === at + 1 || escaped[0] === '') return { end: badUrlEnd(source, escaped[1]), kind: 'bad-url', start, value }
  return [escaped[0], escaped[1]]
}

function urlToken(source: string, start: number, content: number): CssToken {
  let at = content
  let value = ''
  while (/\s/.test(source[at] ?? '')) at++
  if (source[at] === '"' || source[at] === "'") return { end: content, kind: 'function', start, value: 'url' }
  while (at < source.length) {
    const character = source[at] ?? ''
    if (character === ')') return { end: at + 1, kind: 'url', start, value: value.trim().toLowerCase() }
    if (/\s/.test(character)) return urlAfterWhitespace(source, start, at, value)
    if (invalidUrlCharacter(character)) {
      return { end: badUrlEnd(source, at + 1), kind: 'bad-url', start, value }
    }
    if (character === '\\') {
      const escaped = escapedUrlPart(source, start, at, value)
      if (!Array.isArray(escaped)) return escaped
      value += escaped[0]
      at = escaped[1]
    } else {
      value += character
      at++
    }
  }
  return { end: at, kind: 'url', start, value: value.trim().toLowerCase() }
}

function tokenAt(source: string, at: number): CssToken {
  const character = source[at] ?? ''
  if (character === '"' || character === "'") return stringToken(source, at)
  const offset = character === '@' ? 1 : 0
  const parsed = name(source, at + offset)
  if (parsed[0]) {
    const isFunction = offset === 0 && source[parsed[1]] === '('
    if (isFunction && parsed[0] === 'url') return urlToken(source, at, parsed[1] + 1)
    const kind = offset === 1 ? 'at' : isFunction ? 'function' : 'word'
    return { end: parsed[1] + (isFunction ? 1 : 0), kind, start: at, value: parsed[0] }
  }
  const kinds: Record<string, CssTokenKind> = { '{': 'open', '}': 'close', ';': 'semicolon', '(': 'open', '[': 'open', ')': 'close', ']': 'close' }
  return { end: at + 1, kind: kinds[character] ?? 'word', start: at, value: character }
}

export function cssTokens(source: string): CssToken[] {
  const found: CssToken[] = []
  let at = 0
  while (at < source.length) {
    const significant = skipTrivia(source, at)
    if (significant !== at) {
      at = significant
      continue
    }
    const token = tokenAt(source, at)
    found.push(token)
    at = token.end
  }
  return found
}
