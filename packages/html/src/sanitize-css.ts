import { type CssToken, cssEscape, cssTokens } from './css-tokens.ts'

export interface CssSanitizeResult {
  css: string
  removed: string[]
}

const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml)(?:[;,])/i
const DATA_FONT = /^data:(?:font\/[^;,]+|application\/(?:x-)?font-[^;,]+)(?:[;,])/i
const DECLARATION_AT_RULES = new Set(['counter-style', 'font-face', 'font-palette-values', 'page', 'property'])

function normalizedUrl(value: string, decodeEscapes = true): string {
  let normalized = ''
  for (let at = 0; at < value.length; ) {
    if (value.startsWith('/*', at)) {
      const close = value.indexOf('*/', at + 2)
      at = close < 0 ? value.length : close + 2
    } else if (decodeEscapes && value[at] === '\\') {
      const escaped = cssEscape(value, at)
      normalized += escaped[0]
      at = escaped[1]
    } else normalized += value[at++] ?? ''
  }
  normalized = normalized.trim()
  if ((normalized[0] === '"' || normalized[0] === "'") && normalized.at(-1) === normalized[0]) normalized = normalized.slice(1, -1)
  return [...normalized]
    .filter((character) => character.charCodeAt(0) > 0x20 && character.charCodeAt(0) !== 0x7f)
    .join('')
    .toLowerCase()
}

function decodedCss(source: string): string {
  let decoded = ''
  for (let at = 0; at < source.length; ) {
    if (source[at] === '\\') {
      const escaped = cssEscape(source, at)
      decoded += escaped[0]
      at = escaped[1]
    } else decoded += source[at++] ?? ''
  }
  return decoded
    .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function allowedAuditData(value: string, dataFonts: boolean): boolean {
  const argument = value.trimStart().replace(/^["']/, '')
  return DATA_IMAGE.test(argument) || (dataFonts && DATA_FONT.test(argument))
}

function lexicalFindings(source: string, dataFonts: boolean): string[] {
  const text = decodedCss(source)
  const found: string[] = []
  const constructs = /@import|(?:url|src|image-set)\(/gi
  for (const match of text.matchAll(constructs)) {
    const construct = match[0].toLowerCase()
    const after = text.slice((match.index ?? 0) + construct.length)
    if (construct === '@import') {
      const argument = after.trimStart().replace(/^url\(\s*/, '')
      if (!allowedAuditData(argument, dataFonts)) found.push('@import')
    } else if (!allowedAuditData(after, dataFonts)) {
      found.push(`${construct.slice(0, -1)}()`)
    }
  }
  return [...new Set(found)]
}

function matchingClose(list: CssToken[], open: number, limit = list.length): number {
  let depth = 1
  for (let at = open + 1; at < limit; at++) {
    if (list[at]?.kind === 'open' || list[at]?.kind === 'function') depth++
    if (list[at]?.kind === 'close' && --depth === 0) return at
  }
  return limit
}

function unsafeImageSet(list: CssToken[], start: number, close: number): boolean {
  let depth = 0
  for (let at = start + 1; at < close; at++) {
    const token = list[at]
    if (token?.kind === 'function' || token?.kind === 'open') depth++
    else if (token?.kind === 'close') depth--
    else if (token?.kind === 'string' && depth === 0 && !DATA_IMAGE.test(normalizedUrl(token.value, false))) return true
  }
  return false
}

function functionFinding(source: string, list: CssToken[], at: number, end: number, dataFonts: boolean, fontFace: boolean): string | undefined {
  const token = list[at]
  if (token?.kind === 'bad-url') return 'url()'
  if (token?.kind === 'url') {
    if (DATA_IMAGE.test(token.value) || (fontFace && dataFonts && DATA_FONT.test(token.value))) return undefined
    return 'url()'
  }
  if (token?.kind !== 'function') return undefined
  const close = matchingClose(list, at, end)
  if (token.value === 'image-set' || token.value === '-webkit-image-set') return unsafeImageSet(list, at, close) ? 'image-set()' : undefined
  if (token.value !== 'url' && token.value !== 'src') return undefined
  const value = normalizedUrl(source.slice(token.end, close < end ? list[close]?.start : source.length))
  if (DATA_IMAGE.test(value) || (fontFace && dataFonts && DATA_FONT.test(value))) return undefined
  return `${token.value}()`
}

function findings(source: string, list: CssToken[], start: number, end: number, dataFonts: boolean, fontFace: boolean): string[] {
  const found: string[] = []
  for (let at = start; at < end; at++) {
    const token = list[at]
    if (token?.kind === 'at' && token.value === 'import') found.push('@import')
    const finding = functionFinding(source, list, at, end, dataFonts, fontFace)
    if (finding) found.push(finding)
  }
  return [...new Set(found)]
}

function boundary(list: CssToken[], start: number, end: number): number {
  let depth = 0
  for (let at = start; at < end; at++) {
    const token = list[at]
    if (!token) continue
    if (depth === 0 && (token.kind === 'semicolon' || (token.kind === 'open' && token.value === '{'))) return at
    if (token.kind === 'function' || token.kind === 'open') depth++
    else if (token.kind === 'close') depth--
  }
  return end
}

interface CleanUnit {
  character: number
  next: number
  text: string
}

function cleanStatement(source: string, list: CssToken[], start: number, edge: number, dataFonts: boolean, removed: string[]): CleanUnit {
  const first = list[start]
  const delimiter = list[edge]
  if (!first || !delimiter) return { character: source.length, next: edge, text: '' }
  const unsafe = first.kind === 'at' && first.value === 'import' ? ['@import'] : findings(source, list, start, edge + 1, dataFonts, false)
  if (unsafe.length > 0) removed.push(...unsafe)
  return { character: delimiter.end, next: edge + 1, text: unsafe.length === 0 ? source.slice(first.start, delimiter.end) : '' }
}

function cleanBlockRule(source: string, list: CssToken[], start: number, edge: number, end: number, dataFonts: boolean, removed: string[]): CleanUnit {
  const first = list[start]
  const delimiter = list[edge]
  if (!first || !delimiter) return { character: source.length, next: end, text: '' }
  const close = matchingClose(list, edge, end)
  const ruleName = first.kind === 'at' ? first.value : ''
  const fontFace = ruleName === 'font-face'
  const unsafe = findings(source, list, start, edge, dataFonts, false)
  if (fontFace) unsafe.push(...findings(source, list, edge + 1, close, dataFonts, true))
  if (unsafe.length > 0) removed.push(...unsafe)
  let text = ''
  if (unsafe.length === 0) {
    const body =
      first.kind !== 'at' || DECLARATION_AT_RULES.has(ruleName)
        ? cleanDeclarations(source, list, edge + 1, close, dataFonts, removed, fontFace)
        : cleanRules(source, list, edge + 1, close, dataFonts, removed)
    text = source.slice(first.start, delimiter.end) + body
    if (close < end) text += source.slice(list[close]?.start, list[close]?.end)
  }
  return {
    character: close < end ? (list[close]?.end ?? delimiter.end) : source.length,
    next: close < end ? close + 1 : end,
    text,
  }
}

function cleanRuleUnit(source: string, list: CssToken[], start: number, end: number, dataFonts: boolean, removed: string[]): CleanUnit {
  const first = list[start]
  if (!first) return { character: source.length, next: end, text: '' }
  const edge = boundary(list, start, end)
  const delimiter = list[edge]
  if (!delimiter) {
    const unsafe = findings(source, list, start, end, dataFonts, false)
    if (unsafe.length > 0) removed.push(...unsafe)
    return { character: source.length, next: end, text: unsafe.length === 0 ? source.slice(first.start) : '' }
  }
  return delimiter.kind === 'semicolon'
    ? cleanStatement(source, list, start, edge, dataFonts, removed)
    : cleanBlockRule(source, list, start, edge, end, dataFonts, removed)
}

function cleanRules(source: string, list: CssToken[], start: number, end: number, dataFonts: boolean, removed: string[]): string {
  let output = ''
  let character = start === 0 ? 0 : (list[start - 1]?.end ?? source.length)
  let at = start
  while (at < end) {
    const first = list[at]
    if (!first) break
    output += source.slice(character, first.start)
    const unit = cleanRuleUnit(source, list, at, end, dataFonts, removed)
    output += unit.text
    character = unit.character
    at = unit.next
  }
  const rangeEnd = end < list.length ? (list[end]?.start ?? source.length) : source.length
  return output + source.slice(character, rangeEnd)
}

function cleanDeclarationSegment(
  source: string,
  list: CssToken[],
  start: number,
  end: number,
  character: number,
  dataFonts: boolean,
  fontFace: boolean,
  removed: string[],
): [string, number] {
  const delimiter = list[end]
  const hasSemicolon = delimiter?.kind === 'semicolon'
  const segmentEnd = hasSemicolon ? end + 1 : end
  const finish = hasSemicolon ? delimiter.end : end < list.length ? (delimiter?.start ?? source.length) : source.length
  const unsafe = findings(source, list, start, segmentEnd, dataFonts, fontFace)
  if (unsafe.length === 0) return [source.slice(character, finish), finish]
  removed.push(...unsafe)
  return [source.slice(character, list[start]?.start ?? finish), finish]
}

function declarationEnd(list: CssToken[], start: number, end: number): number {
  let depth = 0
  for (let at = start; at < end; at++) {
    const token = list[at]
    if (depth === 0 && token?.kind === 'semicolon') return at
    if (token?.kind === 'function' || token?.kind === 'open') depth++
    else if (token?.kind === 'close') depth--
  }
  return end
}

function isDeclaration(list: CssToken[], start: number): boolean {
  return list[start]?.value.startsWith('--') === true && list[start + 1]?.value === ':'
}

function cleanDeclarations(source: string, list: CssToken[], start: number, end: number, dataFonts: boolean, removed: string[], fontFace = false): string {
  let output = ''
  let character = start === 0 ? 0 : (list[start - 1]?.end ?? source.length)
  let at = start
  while (at < end) {
    const first = list[at]
    if (!first) break
    output += source.slice(character, first.start)
    const edge = boundary(list, at, end)
    if (list[edge]?.kind === 'open' && !isDeclaration(list, at)) {
      const unit = cleanBlockRule(source, list, at, edge, end, dataFonts, removed)
      output += unit.text
      character = unit.character
      at = unit.next
    } else {
      const finish = declarationEnd(list, at, end)
      const cleaned = cleanDeclarationSegment(source, list, at, finish, first.start, dataFonts, fontFace, removed)
      output += cleaned[0]
      character = cleaned[1]
      at = finish < end ? finish + 1 : end
    }
  }
  const rangeEnd = end < list.length ? (list[end]?.start ?? source.length) : source.length
  return output + source.slice(character, rangeEnd)
}

export function sanitizeCss(source: string, declarations: boolean, dataFonts: boolean): CssSanitizeResult {
  const list = cssTokens(source)
  const removed: string[] = []
  const css = declarations ? cleanDeclarations(source, list, 0, list.length, dataFonts, removed) : cleanRules(source, list, 0, list.length, dataFonts, removed)
  const auditRemoved = lexicalFindings(css, dataFonts)
  if (auditRemoved.length > 0) return { css: '', removed: [...new Set([...removed, ...auditRemoved])] }
  return { css, removed: [...new Set(removed)] }
}
