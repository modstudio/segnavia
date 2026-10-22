import type { Color, Color3 } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { formatPdfNumber } from './color-policy.ts'
import {
  advanceColorSpaces,
  type ContentColorSpaces,
  currentNamedSpace,
  emptyContentColorSpaces,
  restoreColorSpaces,
  selectedSpaceFor,
  selectsFillSpace,
  snapshotColorSpaces,
  spaceName,
} from './content-color.ts'
import { binaryString, inlineImageHeader, parseInlineImage } from './inline-image.ts'
import type { PolicyDecision } from './policy.ts'
import { colorSpaceLabel, contentOperatorAction, inlineImageAction, isContentColorOperator, isRegistrationConvertedOperator } from './policy.ts'
import type { PressDestination } from './types.ts'

export { type ContentColorSpaces, emptyContentColorSpaces } from './content-color.ts'

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

function inlineImageEnd(source: string, at: number, destination: PressDestination, convertImages: boolean): number {
  const header = inlineImageHeader(source, at)
  const name = header.colorSpace?.startsWith('/') ? header.colorSpace.slice(1) : undefined
  const policy = inlineImageAction(name, header.imageMask)
  if (policy.action === 'refuse' && !(convertImages && policy.kind === 'rgb')) refusal(`BI operator with color space ${policy.label}`, policy.supported)
  if (destination === 'gray' && policy.kind === 'cmyk') refusal(`BI operator with color space ${policy.label}`, 'RGB or gray input for a greyscale press')
  return parseInlineImage(source, at).end
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
function enforceOperatorPolicy(token: Token, operands: Token[], policy: PolicyDecision): void {
  if (policy.action !== 'refuse') return
  const operator = token.raw
  if (isRegistrationConvertedOperator(operator)) {
    if (operator === 'cs' || operator === 'CS') {
      const name = spaceName(operands)
      if (!name) refusal(`${operator} operator operands`, 'one color space name')
      refusal(`${operator} operator selecting ${colorSpaceLabel({ name })}`, policy.supported)
    }
    refusal(`${operator} operator with numeric operands`, policy.supported)
  }
  const color = operator === 'g' || operator === 'G' ? 'gray' : operator === 'k' || operator === 'K' ? 'CMYK' : 'RGB'
  refusal(`${color} color operator ${operator} after conversion`, policy.supported)
}
function registrationReplacement(token: Token, operands: Token[], policy: PolicyDecision, counts: ContentCounts): Replacement | undefined {
  if (policy.action !== 'convert' || !isRegistrationConvertedOperator(token.raw)) return undefined
  const operator = token.raw
  if (operator === 'cs' || operator === 'CS') return { start: operands[0]?.start ?? token.start, end: token.end, text: '' }
  numeric(operands, 1, operator)
  counts[selectsFillSpace(operator) ? 'fills' : 'strokes']++
  return replacement(token, operands, [0])
}
function colorOperator(
  token: Token,
  operands: Token[],
  convert: (rgb: Color3) => Color,
  counts: ContentCounts,
  inspect: boolean,
  destination: PressDestination,
  namedSpace: string | undefined,
  registrationNames: ReadonlySet<string> | undefined,
): Replacement | undefined {
  const operator = token.raw
  if (!isContentColorOperator(operator)) return undefined
  const patternName = operands.length === 1 && operands[0]?.kind === 'name'
  const selected = selectedSpaceFor(operator, operands, namedSpace)
  const registration = selected !== undefined && Boolean(registrationNames?.has(selected))
  const policy = contentOperatorAction(operator, inspect, selected, patternName, destination, registration)
  enforceOperatorPolicy(token, operands, policy)
  const converted = registrationReplacement(token, operands, policy, counts)
  if (converted) return converted
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
  if (operator === 'k' || operator === 'K') {
    numeric(operands, 4, operator)
    counts[operator === 'k' ? 'fills' : 'strokes']++
  }
  return undefined
}

function applyColorOperator(
  token: Token,
  operands: Token[],
  convert: (rgb: Color3) => Color,
  counts: ContentCounts,
  inspect: boolean,
  destination: PressDestination,
  fillSpace: string | undefined,
  strokeSpace: string | undefined,
  stack: Array<{ fill?: string; stroke?: string }>,
  registrationNames: ReadonlySet<string> | undefined,
  visit: ((found: Replacement) => void) | undefined,
): { fill?: string; stroke?: string } {
  const found = colorOperator(token, operands, convert, counts, inspect, destination, currentNamedSpace(token.raw, fillSpace, strokeSpace), registrationNames)
  if (found) visit?.(found)
  return advanceColorSpaces(token.raw, operands, fillSpace, strokeSpace, stack, MAX_CONTENT_NESTING)
}

function scan(
  source: string,
  convert: (rgb: Color3) => Color,
  inspect: boolean,
  destination: PressDestination,
  visit: ((found: Replacement) => void) | undefined,
  operatorVisit: ((operator: Token, operands: Token[]) => void) | undefined,
  convertImages: boolean,
  registrationNames: ReadonlySet<string> | undefined,
  spaces: ContentColorSpaces,
): ContentCounts {
  const counts = { fills: 0, strokes: 0 }
  let operands: Token[] = []
  let cursor = 0
  let fillSpace = spaces.fill
  let strokeSpace = spaces.stroke
  const stack = spaces.stack.map((entry) => ({ fill: entry.fill, stroke: entry.stroke }))
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
      cursor = inlineImageEnd(source, cursor, destination, convertImages)
      operands = []
    } else if (token.kind === 'operator') {
      operatorVisit?.(token, operands)
      if (visit !== undefined || operatorVisit === undefined) {
        const next = applyColorOperator(token, operands, convert, counts, inspect, destination, fillSpace, strokeSpace, stack, registrationNames, visit)
        fillSpace = next.fill
        strokeSpace = next.stroke
      }
      operands = []
    } else {
      if (operands.length >= MAX_OPERANDS) refusal(`more than ${MAX_OPERANDS} operands before an operator`, `at most ${MAX_OPERANDS} operands`)
      operands.push(token)
    }
  }
  spaces.fill = fillSpace
  spaces.stack = stack
  spaces.stroke = strokeSpace
  return counts
}

export function visitContentTokens(bytes: Uint8Array, visit: (operator: string, operands: { kind: 'name' | 'number'; raw: string }[]) => void): void {
  visitContentOperations(bytes, ({ operator, operands }) => visit(operator, operands))
}

export function visitContentOperations(bytes: Uint8Array, visit: (operation: ContentOperation) => void): void {
  scan(
    binaryString(bytes),
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
    true,
    undefined,
    emptyContentColorSpaces(),
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

export function inspectContent(
  bytes: Uint8Array,
  destination: PressDestination = 'cmyk',
  registrationNames?: ReadonlySet<string>,
  spaces?: ContentColorSpaces,
): ContentCounts {
  return scan(
    binaryString(bytes),
    () => refusal('RGB color operator after conversion', `${destination === 'gray' ? 'gray' : 'CMYK'} operators`),
    true,
    destination,
    undefined,
    undefined,
    false,
    registrationNames,
    spaces ?? emptyContentColorSpaces(),
  )
}
export function rewriteContent(
  bytes: Uint8Array,
  convert: (rgb: Color3) => Color,
  destination: PressDestination = 'cmyk',
  convertImages = false,
  registrationNames?: ReadonlySet<string>,
  spaces?: ContentColorSpaces,
): ContentRewrite {
  const source = binaryString(bytes)
  const tracked = spaces ?? emptyContentColorSpaces()
  const initial = snapshotColorSpaces(tracked)
  let outputLength = bytes.length
  let changed = false
  const counts = scan(
    source,
    convert,
    false,
    destination,
    (found) => {
      changed = true
      outputLength += encoder.encode(found.text).length - (found.end - found.start)
    },
    undefined,
    convertImages,
    registrationNames,
    tracked,
  )
  if (!changed) return { bytes, counts }
  restoreColorSpaces(tracked, initial)
  const output = new Uint8Array(outputLength)
  let inputAt = 0
  let outputAt = 0
  scan(
    source,
    convert,
    false,
    destination,
    (found) => {
      const untouched = bytes.subarray(inputAt, found.start)
      output.set(untouched, outputAt)
      outputAt += untouched.length
      const inserted = encoder.encode(found.text)
      output.set(inserted, outputAt)
      outputAt += inserted.length
      inputAt = found.end
    },
    undefined,
    convertImages,
    registrationNames,
    tracked,
  )
  output.set(bytes.subarray(inputAt), outputAt)
  return { bytes: output, counts }
}
