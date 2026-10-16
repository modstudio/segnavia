import type { Color, Color3 } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { formatPdfNumber } from './color-policy.ts'
import { colorSpaceLabel, contentOperatorAction, inlineImageAction, isContentColorOperator, type PolicyDecision } from './policy.ts'
import type { PressDestination } from './types.ts'

export const MAX_CONTENT_NESTING = 64
// Color operators need at most four operands and Chromium's largest observed operator, cm, uses six; 32 leaves room without unbounded retention.
export const MAX_OPERANDS = 32

interface Token {
  end: number
  kind: 'name' | 'number' | 'operator'
  raw: string
  start: number
}
export interface ContentOperation {
  end: number
  operands: Array<{ end: number; kind: 'name' | 'number'; raw: string; start: number }>
  operator: string
  start: number
}
interface Replacement {
  end: number
  start: number
  text: string
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
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
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
    if (!dictionary && character === ']') return cursor + 1
    cursor++
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

function inlineHeaderToken(source: string, at: number): { end: number; raw: string } {
  let cursor = at
  while (whitespace(source[cursor])) cursor++
  if (source[cursor] === '[') {
    const end = skipComposite(source, cursor, false)
    return { end, raw: source.slice(cursor, end) }
  }
  const token = readToken(source, cursor)
  return token ? { end: token.end, raw: token.raw } : { end: cursor + 1, raw: '' }
}
function inlineHeader(source: string, at: number): { colorSpace?: string; id: number; imageMask: boolean } {
  let cursor = at
  let name = ''
  const values = new Map<string, string>()
  while (cursor < source.length) {
    const token = inlineHeaderToken(source, cursor)
    cursor = token.end
    if (token.raw === 'ID')
      return {
        colorSpace: values.get('/CS') ?? values.get('/ColorSpace'),
        id: cursor,
        imageMask: values.get('/IM') === 'true' || values.get('/ImageMask') === 'true',
      }
    if (!token.raw) continue
    if (!name) name = token.raw
    else {
      values.set(name, token.raw)
      name = ''
    }
  }
  return refusal('truncated BI operator', 'an ID and EI pair')
}
function inlineImageEnd(source: string, at: number, destination: PressDestination): number {
  const { colorSpace, id, imageMask } = inlineHeader(source, at)
  const match = /[\0\t\n\f\r ]EI(?=[\0\t\n\f\r ()<>[\]{}/%]|$)/g
  match.lastIndex = id
  const end = match.exec(source)
  if (!end) return refusal('truncated BI operator', 'an ID and EI pair')
  const name = colorSpace?.startsWith('/') ? colorSpace.slice(1) : undefined
  const policy = inlineImageAction(name, imageMask)
  if (policy.action === 'refuse') refusal(`BI operator with color space ${policy.label}`, policy.supported)
  if (destination === 'gray' && policy.kind === 'cmyk') refusal(`BI operator with color space ${policy.label}`, 'RGB or gray input for a greyscale press')
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
function numeric(operands: Token[], count: number, operator: string): number[] {
  if (operands.length !== count || operands.some((token) => token.kind !== 'number')) refusal(`${operator} operator operands`, `${count} numeric operands`)
  return operands.map((token) => Number(token.raw))
}
function replacement(token: Token, operands: Token[], values: Color): Replacement {
  const operator = values.length === 1 ? (token.raw === token.raw.toLowerCase() ? 'g' : 'G') : token.raw === token.raw.toLowerCase() ? 'k' : 'K'
  return { start: operands[0]?.start ?? token.start, end: token.end, text: `${values.map(formatPdfNumber).join(' ')} ${operator}` }
}
function replaceRgb(token: Token, operands: Token[], convert: (rgb: Color3) => Color, counts: ContentCounts): Replacement {
  const [red = 0, green = 0, blue = 0] = numeric(operands, 3, token.raw)
  counts[token.raw === 'rg' ? 'fills' : 'strokes']++
  return replacement(token, operands, convert([red, green, blue]))
}
function replaceGray(token: Token, operands: Token[], convert: (rgb: Color3) => Color, counts: ContentCounts): Replacement {
  const [gray = 0] = numeric(operands, 1, token.raw)
  counts[token.raw === 'g' ? 'fills' : 'strokes']++
  return replacement(token, operands, convert([gray, gray, gray]))
}
function validateSpace(token: Token, operands: Token[], destination: PressDestination): void {
  if (operands.length !== 1 || operands[0]?.kind !== 'name') refusal(`${token.raw} operator operands`, 'one color space name')
  const name = operands[0].raw.slice(1)
  const policy = contentOperatorAction(token.raw as 'cs' | 'CS', false, name, false, destination)
  if (policy.action === 'refuse') refusal(`${token.raw} operator selecting ${colorSpaceLabel({ name })}`, policy.supported)
}
function enforceOperatorPolicy(token: Token, operands: Token[], policy: PolicyDecision, destination: PressDestination): void {
  if (policy.action !== 'refuse') return
  const operator = token.raw
  if (operator === 'cs' || operator === 'CS') {
    validateSpace(token, operands, destination)
    return
  }
  if (operator === 'sc' || operator === 'SC' || operator === 'scn' || operator === 'SCN')
    refusal(`${operator} operator with numeric operands`, policy.supported)
  const color = operator === 'g' || operator === 'G' ? 'gray' : operator === 'k' || operator === 'K' ? 'CMYK' : 'RGB'
  refusal(`${color} color operator ${operator} after conversion`, policy.supported)
}
function colorOperator(
  token: Token,
  operands: Token[],
  convert: (rgb: Color3) => Color,
  counts: ContentCounts,
  inspect: boolean,
  destination: PressDestination,
): Replacement | undefined {
  const operator = token.raw
  if (!isContentColorOperator(operator)) return undefined
  const patternName = operands.length === 1 && operands[0]?.kind === 'name'
  const policy = contentOperatorAction(operator, inspect, undefined, patternName, destination)
  enforceOperatorPolicy(token, operands, policy, destination)
  if (operator === 'rg' || operator === 'RG') {
    return replaceRgb(token, operands, convert, counts)
  }
  if (operator === 'g' || operator === 'G') {
    if (inspect && destination === 'gray') {
      numeric(operands, 1, operator)
      counts[operator === 'g' ? 'fills' : 'strokes']++
      return undefined
    }
    return replaceGray(token, operands, convert, counts)
  }
  if (operator === 'cs' || operator === 'CS') validateSpace(token, operands, destination)
  else if (operator === 'k' || operator === 'K') {
    numeric(operands, 4, operator)
    counts[operator === 'k' ? 'fills' : 'strokes']++
  }
  return undefined
}

function scan(
  source: string,
  convert: (rgb: Color3) => Color,
  inspect: boolean,
  destination: PressDestination,
  visit?: (found: Replacement) => void,
  operatorVisit?: (operator: Token, operands: Token[]) => void,
): ContentCounts {
  const counts = { fills: 0, strokes: 0 }
  let operands: Token[] = []
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
    cursor = token.end
    if (token.raw === 'BI') {
      cursor = inlineImageEnd(source, cursor, destination)
      operands = []
    } else if (token.kind === 'operator') {
      operatorVisit?.(token, operands)
      const found = colorOperator(token, operands, convert, counts, inspect, destination)
      if (found) visit?.(found)
      operands = []
    } else {
      if (operands.length >= MAX_OPERANDS) refusal(`more than ${MAX_OPERANDS} operands before an operator`, `at most ${MAX_OPERANDS} operands`)
      operands.push(token)
    }
  }
  return counts
}

export function visitContentTokens(bytes: Uint8Array, visit: (operator: string, operands: { kind: 'name' | 'number'; raw: string }[]) => void): void {
  visitContentOperations(bytes, ({ operator, operands }) => visit(operator, operands))
}

export function visitContentOperations(bytes: Uint8Array, visit: (operation: ContentOperation) => void): void {
  scan(
    decoder.decode(bytes),
    () => [0, 0, 0, 0],
    false,
    'cmyk',
    undefined,
    (operator, operands) => {
      visit({
        end: operator.end,
        operands: operands.flatMap((operand) =>
          operand.kind === 'name' || operand.kind === 'number' ? [{ end: operand.end, kind: operand.kind, raw: operand.raw, start: operand.start }] : [],
        ),
        operator: operator.raw,
        start: operator.start,
      })
    },
  )
}

export function visitContentOperators(bytes: Uint8Array, visit: (operator: string, operands: number[]) => void): void {
  visitContentTokens(bytes, (operator, operands) => {
    visit(
      operator,
      operands.filter((operand) => operand.kind === 'number').map((operand) => Number(operand.raw)),
    )
  })
}

export function inspectContent(bytes: Uint8Array, destination: PressDestination = 'cmyk'): ContentCounts {
  return scan(
    decoder.decode(bytes),
    () => refusal('RGB color operator after conversion', `${destination === 'gray' ? 'gray' : 'CMYK'} operators`),
    true,
    destination,
  )
}
export function rewriteContent(bytes: Uint8Array, convert: (rgb: Color3) => Color, destination: PressDestination = 'cmyk'): ContentRewrite {
  const source = decoder.decode(bytes)
  let outputLength = bytes.length
  let changed = false
  const counts = scan(source, convert, false, destination, (found) => {
    changed = true
    outputLength += encoder.encode(found.text).length - (found.end - found.start)
  })
  if (!changed) return { bytes, counts }
  const output = new Uint8Array(outputLength)
  let inputAt = 0
  let outputAt = 0
  scan(source, convert, false, destination, (found) => {
    const untouched = bytes.subarray(inputAt, found.start)
    output.set(untouched, outputAt)
    outputAt += untouched.length
    const inserted = encoder.encode(found.text)
    output.set(inserted, outputAt)
    outputAt += inserted.length
    inputAt = found.end
  })
  output.set(bytes.subarray(inputAt), outputAt)
  return { bytes: output, counts }
}
