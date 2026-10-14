import { RenderRefusedError } from '../errors.ts'

// Chromium programs keep a handful of values; 32 is enough for copy/index/roll without unbounded stack growth.
export const MAX_CALCULATOR_STACK = 32

export type CalculatorOp = { kind: 'number'; int: boolean; value: number } | { kind: 'operator'; name: string } | { kind: 'procedure'; body: CalculatorOp[] }

export type StackValue = { kind: 'n'; int: boolean; value: number } | { kind: 'b'; value: boolean } | { kind: 'p'; body: readonly CalculatorOp[] }

export function calculatorRefuse(found: string, supported: string): never {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}

export interface EvalState {
  count: number
  stack: StackValue[]
}

type Exec = (body: readonly CalculatorOp[]) => void
type Handler = (state: EvalState, exec: Exec) => void

function pop(state: EvalState, operator: string): StackValue {
  const value = state.stack.pop()
  if (!value) return calculatorRefuse(`calculator ${operator} stack underflow`, 'enough operands')
  return value
}

function push(state: EvalState, value: StackValue): void {
  state.stack.push(value)
  if (state.stack.length > MAX_CALCULATOR_STACK) calculatorRefuse(`calculator stack depth ${state.stack.length}`, `at most ${MAX_CALCULATOR_STACK} values`)
}

function popNumber(state: EvalState, operator: string): { int: boolean; value: number } {
  const value = pop(state, operator)
  if (value.kind !== 'n') return calculatorRefuse(`calculator ${operator} operand type`, 'a number')
  return value
}

function popInt(state: EvalState, operator: string): number {
  const value = popNumber(state, operator)
  if (!value.int || !Number.isInteger(value.value)) return calculatorRefuse(`calculator ${operator} operand type`, 'an integer')
  return value.value
}

function popBool(state: EvalState, operator: string): boolean {
  const value = pop(state, operator)
  if (value.kind !== 'b') return calculatorRefuse(`calculator ${operator} operand type`, 'a boolean')
  return value.value
}

function popProc(state: EvalState, operator: string): readonly CalculatorOp[] {
  const value = pop(state, operator)
  if (value.kind !== 'p') return calculatorRefuse(`calculator ${operator} operand type`, 'a procedure')
  return value.body
}

function pushNumber(state: EvalState, value: number, int: boolean): void {
  if (!Number.isFinite(value)) calculatorRefuse('calculator numeric result', 'a finite number')
  push(state, { kind: 'n', value, int: int && Number.isInteger(value) })
}

function pushBool(state: EvalState, value: boolean): void {
  push(state, { kind: 'b', value })
}

function unary(operator: string, apply: (value: number, int: boolean) => { int: boolean; value: number }): Handler {
  return (state) => {
    const operand = popNumber(state, operator)
    const result = apply(operand.value, operand.int)
    pushNumber(state, result.value, result.int)
  }
}

function binary(operator: string, apply: (left: number, right: number, ints: boolean) => { int: boolean; value: number }): Handler {
  return (state) => {
    const right = popNumber(state, operator)
    const left = popNumber(state, operator)
    const result = apply(left.value, right.value, left.int && right.int)
    pushNumber(state, result.value, result.int)
  }
}

function compare(operator: string, apply: (left: number, right: number) => boolean): Handler {
  return (state) => {
    const right = popNumber(state, operator)
    const left = popNumber(state, operator)
    pushBool(state, apply(left.value, right.value))
  }
}

function equal(state: EvalState, operator: string, negate: boolean): void {
  const right = pop(state, operator)
  const left = pop(state, operator)
  let same = false
  if (left.kind === 'n' && right.kind === 'n') same = left.value === right.value
  else if (left.kind === 'b' && right.kind === 'b') same = left.value === right.value
  else calculatorRefuse(`calculator ${operator} operand type`, 'two numbers or two booleans')
  pushBool(state, negate ? !same : same)
}

function psRound(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

function logicalOrBitwise(
  state: EvalState,
  operator: string,
  bools: (left: boolean, right: boolean) => boolean,
  ints: (left: number, right: number) => number,
): void {
  const right = pop(state, operator)
  const left = pop(state, operator)
  if (left.kind === 'b' && right.kind === 'b') {
    pushBool(state, bools(left.value, right.value))
    return
  }
  if (left.kind === 'n' && right.kind === 'n' && left.int && right.int) {
    pushNumber(state, ints(left.value, right.value) | 0, true)
    return
  }
  calculatorRefuse(`calculator ${operator} operand type`, 'two booleans or two integers')
}

const operators: Record<string, Handler> = {
  abs: unary('abs', (value, int) => ({ value: Math.abs(value), int })),
  add: binary('add', (left, right, ints) => ({ value: left + right, int: ints })),
  atan: (state) => {
    const den = popNumber(state, 'atan')
    const num = popNumber(state, 'atan')
    if (num.value === 0 && den.value === 0) calculatorRefuse('calculator atan undefined', 'a non-zero atan pair')
    pushNumber(state, (Math.atan2(num.value, den.value) * 180) / Math.PI, false)
  },
  ceiling: unary('ceiling', (value, int) => ({ value: Math.ceil(value), int })),
  cos: unary('cos', (value) => ({ value: Math.cos((value * Math.PI) / 180), int: false })),
  cvi: unary('cvi', (value) => ({ value: Math.trunc(value), int: true })),
  cvr: unary('cvr', (value) => ({ value, int: false })),
  div: binary('div', (left, right) => ({ value: left / right, int: false })),
  exp: binary('exp', (left, right) => ({ value: left ** right, int: false })),
  floor: unary('floor', (value, int) => ({ value: Math.floor(value), int })),
  idiv: (state) => {
    const right = popInt(state, 'idiv')
    const left = popInt(state, 'idiv')
    if (right === 0) calculatorRefuse('calculator idiv divisor 0', 'a non-zero divisor')
    pushNumber(state, Math.trunc(left / right), true)
  },
  ln: unary('ln', (value) => ({ value: Math.log(value), int: false })),
  log: unary('log', (value) => ({ value: Math.log10(value), int: false })),
  mod: (state) => {
    const right = popInt(state, 'mod')
    const left = popInt(state, 'mod')
    if (right === 0) calculatorRefuse('calculator mod divisor 0', 'a non-zero divisor')
    pushNumber(state, left % right, true)
  },
  mul: binary('mul', (left, right, ints) => ({ value: left * right, int: ints })),
  neg: unary('neg', (value, int) => ({ value: -value, int })),
  round: unary('round', (value, int) => ({ value: psRound(value), int })),
  sin: unary('sin', (value) => ({ value: Math.sin((value * Math.PI) / 180), int: false })),
  sqrt: unary('sqrt', (value) => ({ value: Math.sqrt(value), int: false })),
  sub: binary('sub', (left, right, ints) => ({ value: left - right, int: ints })),
  truncate: unary('truncate', (value, int) => ({ value: Math.trunc(value), int })),
  and: (state) =>
    logicalOrBitwise(
      state,
      'and',
      (left, right) => left && right,
      (left, right) => left & right,
    ),
  bitshift: (state) => {
    const shift = popInt(state, 'bitshift')
    const value = popInt(state, 'bitshift')
    const bits = value | 0
    pushNumber(state, (shift >= 0 ? bits << shift : bits >> -shift) | 0, true)
  },
  eq: (state) => equal(state, 'eq', false),
  false: (state) => pushBool(state, false),
  ge: compare('ge', (left, right) => left >= right),
  gt: compare('gt', (left, right) => left > right),
  le: compare('le', (left, right) => left <= right),
  lt: compare('lt', (left, right) => left < right),
  ne: (state) => equal(state, 'ne', true),
  not: (state) => {
    const value = pop(state, 'not')
    if (value.kind === 'b') {
      pushBool(state, !value.value)
      return
    }
    if (value.kind === 'n' && value.int) {
      pushNumber(state, ~value.value | 0, true)
      return
    }
    calculatorRefuse('calculator not operand type', 'a boolean or an integer')
  },
  or: (state) =>
    logicalOrBitwise(
      state,
      'or',
      (left, right) => left || right,
      (left, right) => left | right,
    ),
  true: (state) => pushBool(state, true),
  xor: (state) =>
    logicalOrBitwise(
      state,
      'xor',
      (left, right) => left !== right,
      (left, right) => left ^ right,
    ),
  if: (state, exec) => {
    const body = popProc(state, 'if')
    if (popBool(state, 'if')) exec(body)
  },
  ifelse: (state, exec) => {
    const otherwise = popProc(state, 'ifelse')
    const thenBody = popProc(state, 'ifelse')
    exec(popBool(state, 'ifelse') ? thenBody : otherwise)
  },
  copy: (state) => {
    const count = popInt(state, 'copy')
    if (count < 0 || state.stack.length < count) calculatorRefuse('calculator copy count', 'a non-negative integer within the stack')
    const copies = state.stack.slice(state.stack.length - count)
    for (const value of copies) push(state, value)
  },
  dup: (state) => {
    const value = pop(state, 'dup')
    push(state, value)
    push(state, value)
  },
  exch: (state) => {
    const top = pop(state, 'exch')
    const below = pop(state, 'exch')
    push(state, top)
    push(state, below)
  },
  index: (state) => {
    const n = popInt(state, 'index')
    if (n < 0 || n >= state.stack.length) calculatorRefuse('calculator index', 'a non-negative integer within the stack')
    const value = state.stack[state.stack.length - 1 - n]
    if (value) push(state, value)
  },
  pop: (state) => {
    pop(state, 'pop')
  },
  roll: (state) => {
    const j = popInt(state, 'roll')
    const n = popInt(state, 'roll')
    if (n < 0 || state.stack.length < n) calculatorRefuse('calculator roll count', 'a non-negative integer within the stack')
    if (n === 0) return
    const shift = ((j % n) + n) % n
    const start = state.stack.length - n
    const slice = state.stack.splice(start, n)
    state.stack.push(...slice.slice(n - shift), ...slice.slice(0, n - shift))
  },
}

export function applyOperator(name: string, state: EvalState, exec: Exec): void {
  const handler = operators[name]
  if (!handler) calculatorRefuse(`calculator operator ${/^[A-Za-z][A-Za-z0-9]{0,15}$/.test(name) ? name : 'other'}`, 'the PDF calculator operators')
  handler(state, exec)
}
