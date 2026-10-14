import { applyOperator, type CalculatorOp, calculatorRefuse, type EvalState, MAX_CALCULATOR_STACK, type StackValue } from './calculator-ops.ts'

export { type CalculatorOp, calculatorRefuse, MAX_CALCULATOR_STACK } from './calculator-ops.ts'

// Chromium's longest observed type-4 program is a few hundred bytes; 8 KiB bounds an author-influenced stream without clipping a many-stop gradient.
export const MAX_CALCULATOR_PROGRAM_BYTES = 8192
// A type-4 program has no loop; 4096 operators per evaluation covers nested ifelse chains with headroom.
export const MAX_CALCULATOR_OPERATORS = 4096
export const MAX_CALCULATOR_PROCEDURE_DEPTH = 32

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/
const OPERATOR = /^[A-Za-z][A-Za-z0-9]*/
const whitespace = (character: string | undefined): boolean => character !== undefined && /[\0\t\n\f\r ]/.test(character)

function skipComment(source: string, at: number): number {
  let cursor = at + 1
  while (cursor < source.length && source[cursor] !== '\r' && source[cursor] !== '\n') cursor++
  return cursor
}

function skipSpace(source: string, at: number): number {
  let cursor = at
  while (cursor < source.length) {
    if (whitespace(source[cursor])) cursor++
    else if (source[cursor] === '%') cursor = skipComment(source, cursor)
    else break
  }
  return cursor
}

function classifiedOperator(name: string): string {
  return /^[A-Za-z][A-Za-z0-9]{0,15}$/.test(name) ? name : 'other'
}

function parseNumber(source: string, at: number): { end: number; op: CalculatorOp } {
  const match = NUMBER.exec(source.slice(at))
  if (!match) return calculatorRefuse('calculator number', 'a PDF calculator number')
  const raw = match[0]
  const value = Number(raw)
  if (!Number.isFinite(value)) return calculatorRefuse('calculator number', 'a finite PDF calculator number')
  return { end: at + raw.length, op: { kind: 'number', value, int: !/[.eE]/.test(raw) } }
}

function parseOperator(source: string, at: number): { end: number; op: CalculatorOp } {
  const match = OPERATOR.exec(source.slice(at))
  if (!match) return calculatorRefuse(`calculator token ${classifiedOperator(source[at] ?? 'other')}`, 'a PDF calculator operator, number, or procedure')
  return { end: at + match[0].length, op: { kind: 'operator', name: match[0] } }
}

function parseProcedure(source: string, at: number, depth: number): { end: number; op: CalculatorOp } {
  if (depth > MAX_CALCULATOR_PROCEDURE_DEPTH)
    return calculatorRefuse(`calculator procedure nesting over ${MAX_CALCULATOR_PROCEDURE_DEPTH}`, `at most ${MAX_CALCULATOR_PROCEDURE_DEPTH} levels`)
  const body: CalculatorOp[] = []
  let cursor = skipSpace(source, at + 1)
  while (cursor < source.length && source[cursor] !== '}') {
    const parsed = parseToken(source, cursor, depth + 1)
    body.push(parsed.op)
    cursor = skipSpace(source, parsed.end)
  }
  if (cursor >= source.length) return calculatorRefuse('calculator truncated procedure', 'a closing }')
  return { end: cursor + 1, op: { kind: 'procedure', body } }
}

function parseToken(source: string, at: number, depth: number): { end: number; op: CalculatorOp } {
  const character = source[at]
  if (character === '{') return parseProcedure(source, at, depth)
  if (character === '+' || character === '-' || character === '.' || (character !== undefined && character >= '0' && character <= '9'))
    return parseNumber(source, at)
  return parseOperator(source, at)
}

export function parseCalculator(source: string): CalculatorOp[] {
  if (source.length > MAX_CALCULATOR_PROGRAM_BYTES)
    calculatorRefuse(`calculator program length ${source.length}`, `at most ${MAX_CALCULATOR_PROGRAM_BYTES} bytes`)
  const tokens: CalculatorOp[] = []
  let cursor = skipSpace(source, 0)
  while (cursor < source.length) {
    const parsed = parseToken(source, cursor, 1)
    tokens.push(parsed.op)
    cursor = skipSpace(source, parsed.end)
  }
  if (tokens.length === 1 && tokens[0]?.kind === 'procedure') return tokens[0].body
  return tokens
}

function push(state: EvalState, value: StackValue): void {
  state.stack.push(value)
  if (state.stack.length > MAX_CALCULATOR_STACK)
    calculatorRefuse(`calculator stack depth ${state.stack.length}`, `at most ${MAX_CALCULATOR_STACK} values`)
}

function exec(body: readonly CalculatorOp[], state: EvalState): void {
  for (const token of body) {
    if (token.kind === 'number') {
      push(state, { kind: 'n', value: token.value, int: token.int })
      continue
    }
    if (token.kind === 'procedure') {
      push(state, { kind: 'p', body: token.body })
      continue
    }
    state.count++
    if (state.count > MAX_CALCULATOR_OPERATORS)
      calculatorRefuse(`calculator operators ${state.count}`, `at most ${MAX_CALCULATOR_OPERATORS} operators per evaluation`)
    applyOperator(token.name, state, (inner) => exec(inner, state))
  }
}

export function evaluateCalculator(program: readonly CalculatorOp[], inputs: readonly number[]): number[] {
  const state: EvalState = {
    count: 0,
    stack: inputs.map((value) => ({ kind: 'n' as const, value, int: Number.isInteger(value) })),
  }
  if (state.stack.length > MAX_CALCULATOR_STACK)
    calculatorRefuse(`calculator stack depth ${state.stack.length}`, `at most ${MAX_CALCULATOR_STACK} values`)
  exec(program, state)
  return state.stack.map((value) => {
    if (value.kind !== 'n') return calculatorRefuse('calculator output type', 'numbers')
    return value.value
  })
}
