import type { Color3, Color4 } from '../color/types.ts'
import { formatPdfNumber } from './color-policy.ts'

export const MAX_CONTENT_NESTING = 64

interface Token {
  end: number
  kind: 'name' | 'number' | 'operator'
  raw: string
  start: number
}

export interface ContentCounts {
  fills: number
  strokes: number
}

export interface ContentRewrite {
  bytes: Uint8Array
  counts: ContentCounts
}

const decoder = new TextDecoder('latin1')
const encoder = new TextEncoder()
const numberPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)$/
const whitespace = (character: string | undefined): boolean => character !== undefined && /[\0\t\n\f\r ]/.test(character)
const delimiter = (character: string | undefined): boolean => character !== undefined && /[()<>{}[\]/%]/.test(character)

function refusal(found: string, supported: string): never {
  throw new Error(`PDF content has unsupported ${found}; supported: ${supported}`)
}

function skipComment(source: string, at: number): number {
  let cursor = at + 1
  while (cursor < source.length && source[cursor] !== '\r' && source[cursor] !== '\n') cursor++
  return cursor
}

function skipLiteral(source: string, at: number): number {
  let cursor = at + 1
  let depth = 1
  while (cursor < source.length) {
    const character = source[cursor]
    if (character === '\\') {
      cursor += 2
      continue
    }
    if (character === '(' && ++depth > MAX_CONTENT_NESTING)
      refusal(`literal string nesting over ${MAX_CONTENT_NESTING}`, `at most ${MAX_CONTENT_NESTING} levels`)
    if (character === ')' && --depth === 0) return cursor + 1
    cursor++
  }
  return refusal('truncated literal string', 'a closing parenthesis')
}

function skipHex(source: string, at: number): number {
  const end = source.indexOf('>', at + 1)
  if (end < 0) return refusal('truncated hex string', 'a closing >')
  return end + 1
}

function skipComposite(source: string, at: number, dictionary: boolean, depth = 1): number {
  if (depth > MAX_CONTENT_NESTING) refusal(`dictionary or array nesting over ${MAX_CONTENT_NESTING}`, `at most ${MAX_CONTENT_NESTING} levels`)
  let cursor = at + (dictionary ? 2 : 1)
  while (cursor < source.length) {
    const character = source[cursor]
    const nested = skipCompositeConstruct(source, cursor, depth)
    if (nested !== undefined) {
      cursor = nested
      continue
    }
    if (dictionary && character === '>' && source[cursor + 1] === '>') return cursor + 2
    else if (!dictionary && character === ']') return cursor + 1
    else cursor++
  }
  return refusal(`truncated ${dictionary ? 'dictionary' : 'array'}`, dictionary ? 'a closing >>' : 'a closing ]')
}

function skipCompositeConstruct(source: string, cursor: number, depth: number): number | undefined {
  const character = source[cursor]
  if (whitespace(character)) return cursor + 1
  if (character === '%') return skipComment(source, cursor)
  if (character === '(') return skipLiteral(source, cursor)
  if (character === '<') return source[cursor + 1] === '<' ? skipComposite(source, cursor, true, depth + 1) : skipHex(source, cursor)
  if (character === '[') return skipComposite(source, cursor, false, depth + 1)
  return undefined
}

function inlineImageEnd(source: string, at: number): number {
  let cursor = at
  let id = -1
  while (cursor < source.length) {
    while (whitespace(source[cursor])) cursor++
    const start = cursor
    while (cursor < source.length && !whitespace(source[cursor]) && !delimiter(source[cursor])) cursor++
    const word = source.slice(start, cursor)
    if (word === 'ID') {
      id = cursor
      break
    }
    if (cursor === start) cursor++
  }
  if (id < 0) return refusal('truncated BI operator', 'an ID and EI pair')
  const header = source.slice(at, id)
  if (/\/(?:CS|ColorSpace)\s+\/(?:RGB|DeviceRGB)\b/.test(header)) refusal('BI operator with RGB color space', 'a non-RGB inline image')
  const match = /[\0\t\n\f\r ]EI(?=[\0\t\n\f\r ()<>[\]{}/%]|$)/g
  match.lastIndex = id
  const end = match.exec(source)
  if (!end) return refusal('truncated BI operator', 'an ID and EI pair')
  return end.index + end[0].length
}

function skippedConstruct(source: string, cursor: number): number | undefined {
  const character = source[cursor]
  if (whitespace(character)) return cursor + 1
  if (character === '%') return skipComment(source, cursor)
  if (character === '(') return skipLiteral(source, cursor)
  if (character === '<') return source[cursor + 1] === '<' ? skipComposite(source, cursor, true) : skipHex(source, cursor)
  if (character === '[') return skipComposite(source, cursor, false)
  return undefined
}

function readToken(source: string, cursor: number): Token | undefined {
  const start = cursor
  if (source[cursor] === '/') {
    cursor++
    while (cursor < source.length && !whitespace(source[cursor]) && !delimiter(source[cursor])) cursor++
    return { start, end: cursor, raw: source.slice(start, cursor), kind: 'name' }
  }
  if (delimiter(source[cursor])) return undefined
  while (cursor < source.length && !whitespace(source[cursor]) && !delimiter(source[cursor])) cursor++
  const raw = source.slice(start, cursor)
  return { start, end: cursor, raw, kind: numberPattern.test(raw) ? 'number' : 'operator' }
}

function tokens(source: string): Token[] {
  const result: Token[] = []
  let cursor = 0
  while (cursor < source.length) {
    const skipped = skippedConstruct(source, cursor)
    if (skipped !== undefined) {
      cursor = skipped
      continue
    }
    const token = readToken(source, cursor)
    if (!token) {
      cursor++
      continue
    }
    result.push(token)
    cursor = token.end
    if (token.raw === 'BI') cursor = inlineImageEnd(source, cursor)
  }
  return result
}

function numeric(operands: Token[], count: number, operator: string): number[] {
  if (operands.length !== count || operands.some((token) => token.kind !== 'number')) refusal(`${operator} operator operands`, `${count} numeric operands`)
  return operands.map((token) => Number(token.raw))
}

export function rewriteContent(bytes: Uint8Array, convert: (rgb: Color3) => Color4): ContentRewrite {
  const source = decoder.decode(bytes)
  const replacements: Array<{ start: number; end: number; text: string }> = []
  const counts = { fills: 0, strokes: 0 }
  let operands: Token[] = []
  for (const token of tokens(source)) {
    if (token.kind !== 'operator') {
      operands.push(token)
      continue
    }
    applyColorOperator(token, operands, convert, replacements, counts)
    operands = []
  }
  if (replacements.length === 0) return { bytes, counts }
  const parts: Uint8Array[] = []
  let cursor = 0
  for (const replacement of replacements) {
    parts.push(bytes.subarray(cursor, replacement.start), encoder.encode(replacement.text))
    cursor = replacement.end
  }
  parts.push(bytes.subarray(cursor))
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const rewritten = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    rewritten.set(part, offset)
    offset += part.length
  }
  return { bytes: rewritten, counts }
}

function applyColorOperator(
  token: Token,
  operands: Token[],
  convert: (rgb: Color3) => Color4,
  replacements: Array<{ start: number; end: number; text: string }>,
  counts: ContentCounts,
): void {
  const operator = token.raw
  if (operator === 'rg' || operator === 'RG') {
    replaceRgb(token, operands, convert, replacements, counts)
    return
  }
  if (operator === 'g' || operator === 'G') {
    replaceGray(token, operands, replacements, counts)
    return
  }
  if (operator === 'cs' || operator === 'CS') {
    validateSpace(operator, operands)
    return
  }
  if (['sc', 'SC', 'scn', 'SCN'].includes(operator)) {
    validateSetColor(operator, operands)
    return
  }
  if (operator !== 'k' && operator !== 'K') return
  numeric(operands, 4, operator)
  counts[operator === 'k' ? 'fills' : 'strokes']++
}

function replaceRgb(
  token: Token,
  operands: Token[],
  convert: (rgb: Color3) => Color4,
  replacements: Array<{ start: number; end: number; text: string }>,
  counts: ContentCounts,
): void {
  const [red = 0, green = 0, blue = 0] = numeric(operands, 3, token.raw)
  const values = convert([red, green, blue]).map(formatPdfNumber)
  replacements.push({ start: operands[0]?.start ?? token.start, end: token.end, text: `${values.join(' ')} ${token.raw === 'rg' ? 'k' : 'K'}` })
  counts[token.raw === 'rg' ? 'fills' : 'strokes']++
}

function replaceGray(token: Token, operands: Token[], replacements: Array<{ start: number; end: number; text: string }>, counts: ContentCounts): void {
  const [gray = 0] = numeric(operands, 1, token.raw)
  replacements.push({
    start: operands[0]?.start ?? token.start,
    end: token.end,
    text: `0 0 0 ${formatPdfNumber(1 - gray)} ${token.raw === 'g' ? 'k' : 'K'}`,
  })
  counts[token.raw === 'g' ? 'fills' : 'strokes']++
}

function validateSpace(operator: string, operands: Token[]): void {
  if (operands.length !== 1 || operands[0]?.kind !== 'name') refusal(`${operator} operator operands`, 'one color space name')
  if (!['/Pattern', '/DeviceGray', '/DeviceCMYK'].includes(operands[0].raw))
    refusal(`${operator} operator selecting ${operands[0].raw}`, '/Pattern, /DeviceGray, or /DeviceCMYK')
}

function validateSetColor(operator: string, operands: Token[]): void {
  const pattern = (operator === 'scn' || operator === 'SCN') && operands.length === 1 && operands[0]?.kind === 'name'
  if (!pattern) refusal(`${operator} operator with numeric operands`, 'a pattern name with scn or SCN')
}
